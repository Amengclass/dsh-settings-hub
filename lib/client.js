/**
 * dsh-settings-hub — browser half.
 *
 * Takes over the settings shell by shadowing the `sidebar.settings` single
 * slot (same cell, lower priority → lowest priority renders; officially
 * sanctioned takeover, replaceRisk: "shadows-shipped-ui"). Our shell rebuilds
 * the nav rail:
 *
 *   - native sections (general/models/plugins/agent-presets) keep their rows
 *   - every other section collapses under one "扩展设置项" group
 *
 * Section content renders through a mini slot renderer: winners via
 * ctx.slots.entriesOfSlot(), components re-rendered unmodified with props
 * assembled from ctx.slots.hostFace() (official renderer data face). Child
 * slots render through a bound renderSlot that validates the entry's own
 * children declaration — the same authorization contract the official
 * renderer enforces. The shipped shell stays registered; unloading this
 * plugin restores it automatically via the cordis effect disposer.
 */
window.__ModuleLoader__.load({
	id: "dsh-settings-hub",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const jsxRuntime = require("react/jsx-runtime");
		const slotsPkg = require("@deepseek-ai/dsh-client-ui-slots");
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		/** Sections that keep their own top-level nav row (native set). */
		const NATIVE_IDS = new Set(["general", "models", "plugins", "agent-presets"]);

		/** Per-row nav icon — mirrors the shipped shell's navIcon(id) mapping. */
		function navIcon(id) {
			if (id === "models") return jsxRuntime.jsx(primitives.IconDataOutline16, { size: 16 });
			if (id === "agent-presets") return jsxRuntime.jsx(primitives.IconAgentPresetOutline16, { size: 16 });
			if (id === "plugins") return jsxRuntime.jsx(primitives.IconPersonalizationOutline16, { size: 16 });
			return jsxRuntime.jsx(primitives.IconSettingsOutline16, { size: 16 });
		}

		/* ------------------------------------------------------------------ *
		 * Mini slot renderer (root-scope settings slots; no chains/stores).  *
		 * ------------------------------------------------------------------ */

		/**
		 * uSES-with-selector hook over a bare observable source, cached per
		 * source. Mirrors the official bindSnapshotSelector: subscribe notifies
		 * on every store tick (stores mutate in place, so raw-snapshot identity
		 * must NOT gate notification); the selector result is cached by eq.
		 */
		const hookCache = new WeakMap();
		function observableHookOf(source) {
			let hook = hookCache.get(source);
			if (hook === undefined) {
				hook = function useObservable(selector, eq) {
					const [subscribe, getSnapshot] = react.useMemo(() => {
						let lastRaw;
						let lastSelected;
						let has = false;
						return [
							(onStoreChange) => source.subscribe(onStoreChange),
							() => {
								const raw = source.getSnapshot();
								if (!has || !(eq ? eq(lastRaw, raw) : Object.is(lastRaw, raw))) {
									lastRaw = raw;
									lastSelected = selector(raw);
									has = true;
								}
								return lastSelected;
							},
						];
					}, [source, selector]);
					return react.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
				};
				hookCache.set(source, hook);
			}
			return hook;
		}

		/** Locale t seat: fresh identity per revision so memoized children refresh. */
		const seatCache = new WeakMap();
		function makeLocaleSeat(face, ns) {
			let perNs = seatCache.get(face);
			if (!perNs) { perNs = new Map(); seatCache.set(face, perNs); }
			const revision = face.getSnapshot().revision;
			const cached = perNs.get(ns);
			if (cached && cached.revision === revision) return cached.t;
			const bound = face.bind(ns);
			const t = (key, params) => bound(key, params);
			perNs.set(ns, { revision, t });
			return t;
		}

		/** Error boundary per entry — mirrors the official renderer isolation. */
		class EntryBoundary extends react.Component {
			state = { failed: false };
			static getDerivedStateFromError() { return { failed: true }; }
			componentDidCatch(error, info) {
				console.error("[dsh-settings-hub] section entry crashed:", error?.stack ?? String(error), info?.componentStack);
			}
			render() {
				if (this.state.failed) {
					return jsxRuntime.jsx("div", { "data-slot-error": this.props.slotKey, children: "此插件的设置页渲染失败" });
				}
				return this.props.children;
			}
		}

		/** Stable uSES pair over a slot's version counter. */
		function useSlotVersion(ctx, key) {
			const [subscribe, getVersion] = react.useMemo(() => [
				(fn) => ctx.slots.subscribe(key, fn),
				() => ctx.slots.getVersion(key),
			], [ctx, key]);
			return react.useSyncExternalStore(subscribe, getVersion, getVersion);
		}

		/**
		 * Bound renderSlot for one entry: authorizes against the entry's own
		 * children declaration (SlotOwnershipError semantics), then projects the
		 * child slot's winners sorted by order. Dispatch options mirror the
		 * official renderer: `entryKey` selects one keyed cell (the owner
		 * dispatches one key at a time); `only` selects one list cell by id.
		 */
		function boundRenderSlotOf(ctx, entry) {
			return function renderSlot(key, ownerProps, opts) {
				if (!entry.children || !entry.children[key]) {
					throw new Error(`SlotOwnershipError: '${key}' is not declared by this entry's children`);
				}
				return jsxRuntime.jsx(
					ChildOutlet,
					{ ctx, childKey: key, ownerProps: ownerProps ?? {}, only: opts?.only, entryKey: opts?.entryKey },
					key,
				);
			};
		}

		/** Child-slot outlet: re-renders on ledger mutations of its key. */
		function ChildOutlet({ ctx, childKey, ownerProps, only, entryKey }) {
			const version = useSlotVersion(ctx, childKey);
			const rendered = react.useMemo(() => {
				const winners = ctx.slots.entriesOfSlot(childKey)
					.filter((e) => {
						if (only !== undefined && e.options.id !== only) return false;
						if (entryKey !== undefined && e.options.key !== entryKey) return false;
						return true;
					})
					.slice()
					.sort((a, b) => (a.options.order ?? 0) - (b.options.order ?? 0));
				if (winners.length === 0) return null;
				return winners.map((e) => renderEntry(ctx, childKey, e, ownerProps));
			}, [ctx, childKey, ownerProps, only, entryKey, version]);
			return jsxRuntime.jsx(jsxRuntime.Fragment, { children: rendered });
		}

		/**
		 * Assemble one winning entry's composed props and render its component.
		 * Mirrors the official composition order: standard kit (useSessions/
		 * useWorkspaces/t/renderSlot/useStore/actions) + inject face (its hooks
		 * compartment bound to use<Name> selector hooks) + owner props (owner
		 * last). Root scope → inject() runs with zero args; a declared store
		 * appends `actions` as the second inject arg, exactly as the official
		 * renderer does (InjectParams).
		 */
		function renderEntry(ctx, slotKey, entry, ownerProps) {
			const host = ctx.slots.hostFace();
			const kit = {};
			kit.useSessions = observableHookOf(host.sessions.list);
			kit.useWorkspaces = observableHookOf(host.workspaces.list);
			if (entry.locale !== undefined) {
				const face = host.locale;
				if (face === undefined) throw new Error(`[dsh-settings-hub] entry locale '${entry.locale}' but no locale face installed`);
				kit.t = makeLocaleSeat(face, entry.locale);
			}
			if (entry.children !== undefined) {
				kit.renderSlot = boundRenderSlotOf(ctx, entry);
			}
			// Store seat: resolve the instance (root scope → ROOT_INSTANCE_KEY)
			// and expose the uSES pair + actions, as standardKit does.
			if (entry.store !== undefined) {
				const store = host.storeOf(entry, "root");
				kit.useStore = observableHookOf(store);
				kit.actions = store.actions;
			}
			// Inject face: hooks compartment sources become use<Name> hooks;
			// remaining keys pass through verbatim (InjectFace contract).
			let injected = {};
			if (typeof entry.inject === "function") {
				const raw = entry.inject(kit.actions !== undefined ? kit.actions : undefined) ?? {};
				const { hooks, ...rest } = raw;
				injected = { ...rest };
				if (hooks) {
					for (const [name, source] of Object.entries(hooks)) {
						const hookName = `use${name[0]?.toUpperCase() ?? ""}${name.slice(1)}`;
						injected[hookName] = observableHookOf(source);
					}
				}
			}
			return jsxRuntime.jsx(
				EntryBoundary,
				{ slotKey, children: jsxRuntime.jsx(entry.component, { ...kit, ...injected, ...ownerProps }) },
				entry,
			);
		}

		/** Top-level settings.section outlet for the hub panel. */
		function HubSectionOutlet({ ctx, ownerProps, only }) {
			const version = useSlotVersion(ctx, "settings.section");
			const rendered = react.useMemo(() => {
				const winners = ctx.slots.entriesOfSlot("settings.section")
					.filter((e) => e.options.id === only)
					.slice()
					.sort((a, b) => (a.options.order ?? 0) - (b.options.order ?? 0));
				const hit = winners[0];
				if (!hit) return jsxRuntime.jsx("div", { "data-slot-error": "settings.section" });
				return renderEntry(ctx, "settings.section", hit, ownerProps);
			}, [ctx, ownerProps, only, version]);
			return jsxRuntime.jsx(jsxRuntime.Fragment, { children: rendered });
		}

		/* -------------------------------------------------- *
		 * Hub shell chrome (modal panel + grouped nav rail). *
		 * -------------------------------------------------- */

		/** Shared row metrics — mirror the shipped shell's navCell exactly. */
		const NAV_CELL = {
			display: "flex", alignItems: "center", gap: 8, width: "100%", height: 40,
			padding: "9px 16px 9px 12px", border: "none", borderRadius: 12, boxSizing: "border-box",
			cursor: "pointer", color: "var(--dsw-alias-label-primary)", font: "inherit", fontSize: 14,
			lineHeight: "22px", textAlign: "left", overflow: "hidden", background: "none",
		};
		const NAV_LABEL = { flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

		/* ------------------------------------------------------------------ *
		 * Plugin-row drag-and-drop reorder (localStorage-persisted).        *
		 * ------------------------------------------------------------------ */

		const GROUP_ORDER_KEY = 'dsh-settings-hub-group-order';
		const SECTION_ORDER_KEY = 'dsh-settings-hub-section-order';
		function loadGroupOrder() {
			try { return JSON.parse(localStorage.getItem(GROUP_ORDER_KEY)) ?? []; } catch { return []; }
		}
		function saveGroupOrder(groups) {
			try { localStorage.setItem(GROUP_ORDER_KEY, JSON.stringify(groups)); } catch {}
		}
		function loadSectionOrder() {
			try { return JSON.parse(localStorage.getItem(SECTION_ORDER_KEY)) ?? {}; } catch { return {}; }
		}
		function saveSectionOrder(obj) {
			try { localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(obj)); } catch {}
		}

		/**
		 * Installed plugin names — sourced from profile's package.json.
		 * Update this list when plugins are installed/uninstalled.
		 */
		const INSTALLED_PLUGINS = [
			"@linxin666/dsh-web-ui-all",
			"dsh-free-search",
			"dsh-settings-hub",
			"dshmarket",
		];

		/**
		 * Dependency map: sub-dependency name → parent installed plugin.
		 * Built from recursive reading of node_modules package.json files.
		 * Only includes deps that actually appear in loadCache (dsh modules).
		 * Update when plugins/dependencies change.
		 */
		const DEP_MAP = {
			"@linxin666/dsh-client-ui-plugin-manager": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-client-ui-community-plugins": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-client-ui-market": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-client-ui-aionui-panel": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-client-ui-task-board": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-client-ui-git-graph": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-perf": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-pet": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-remote-web-ui": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-ssh": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-tool-describe-image": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-liangshen": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-client-ui-skill-explorer": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-desktop-launcher": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-doctor": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-client-ui-web-ui-settings": "@linxin666/dsh-web-ui-all",
			"@linxin666/dsh-client-ui-skin-center": "@linxin666/dsh-web-ui-all",
			"@mlgbnb/dsh-archive-manager": "@linxin666/dsh-web-ui-all",
			"@morlay/better-session": "@linxin666/dsh-web-ui-all",
			"dsh-better-sidebar": "@linxin666/dsh-web-ui-all",
		};

		function buildParentMap() {
			const installed = new Set(INSTALLED_PLUGINS);
			return function getParent(modId) {
				if (installed.has(modId)) return modId;
				return DEP_MAP[modId] || modId;
			};
		}

		function buildPluginSectionMap() {
			const cache = (window.__DSH_MODULES__ || {}).loadCache;
			if (!cache) return {};
			const getParent = buildParentMap();
			const groups = {}; // parentPkg → sectionIds[]
			for (const [modId, mod] of cache) {
				if (modId.startsWith('@deepseek-ai/')) continue;
				if (!mod || !mod.exports || typeof mod.exports.apply !== 'function') continue;
				const parent = getParent(modId);
				const src = String(mod.exports.apply);
				if (!src.includes('settings.section')) continue;
				const sectionIds = [...src.matchAll(/id:\s*["']([^"']+)["']/g)]
					.map((m) => m[1])
					.filter((id) => !NATIVE_IDS.has(id));
				if (sectionIds.length === 0) continue;
				if (!groups[parent]) groups[parent] = [];
				groups[parent].push(...sectionIds);
			}
			const map = {};
			for (const [pkg, sectionIds] of Object.entries(groups)) {
				const slash = pkg.indexOf('/');
				const name = pkg.startsWith('@') && slash !== -1
					? pkg.substring(slash + 1)
					: pkg;
				map[name.replace(/^(dsh-)?/, '').replace(/-/g, ' ')] = sectionIds;
			}
			return map;
		}

		function NavRow({ row, active, onSelect }) {
			return jsxRuntime.jsxs("button", {
				type: "button",
				style: { ...NAV_CELL, background: active ? "var(--dsw-specific-sidebar-nav-item-active)" : "none" },
				onClick: () => onSelect(row.id),
				children: [
					navIcon(row.id),
					jsxRuntime.jsx("span", { style: NAV_LABEL, children: row.label }),
				],
			});
		}

		/**
		 * Group header row — same cell metrics as NavRow (icon 16px + label), plus
		 * a trailing caret. Pure disclosure control: never shows a selected
		 * background (VS Code / macOS settings pattern — the only highlight in
		 * the rail is the active leaf row); hover uses the shipped nav token.
		 */
		function GroupRow({ open, onToggle, label }) {
			return jsxRuntime.jsxs("button", {
				type: "button",
				className: "dshub-group-toggle",
				style: NAV_CELL,
				"aria-expanded": open,
				onClick: onToggle,
				children: [
					jsxRuntime.jsx(primitives.IconSparkle16, { size: 16 }),
					jsxRuntime.jsx("span", { style: NAV_LABEL, children: label }),
					jsxRuntime.jsx("svg", {
						width: 16, height: 16, viewBox: "0 0 16 16", flex: "none",
						style: { color: "var(--dsw-alias-label-secondary)", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease" },
						"aria-hidden": "true",
						children: jsxRuntime.jsx("path", {
							d: "M6 4 L10 8 L6 12",
							fill: "none", stroke: "currentColor", strokeWidth: 1.5,
							strokeLinecap: "round", strokeLinejoin: "round",
						}),
					}),
				],
			});
		}

		/**
		 * Child row — same grid as NavRow but indented one level.
		 * Long-press (500ms) activates grab cursor and enters custom drag
		 * mode; pointer events handle reorder without HTML5 Drag API (which
		 * can't be gated on long-press). Hover/focus stay unchanged from
		 * the pre-drag baseline.
		 */
		/** Visual separator for a plugin group — draggable as a whole group. */
		function PluginGroupSeparator({ pluginName, onPointerDown, onPointerUp, isDragging, isDragOver, dragDirection }) {
			const indicatorShadow = isDragOver
				? (dragDirection === "up" ? "inset 0 2px 0 0 var(--dsw-alias-label-primary)" : "inset 0 -2px 0 0 var(--dsw-alias-label-primary)")
				: "none";
			return jsxRuntime.jsx("div", {
				"data-plugin-id": "__group__" + pluginName,
				onPointerDown: (e) => onPointerDown(e, "__group__" + pluginName),
				onPointerUp,
				onPointerCancel: onPointerUp,
				style: {
					display: "flex", alignItems: "center", width: "100%", height: 24,
					padding: "0 12px 0 36px", boxSizing: "border-box",
					fontSize: 11, fontWeight: 600, color: "var(--dsw-alias-label-secondary)",
					letterSpacing: "0.5px", textTransform: "uppercase",
					opacity: isDragging ? 0.3 : 0.7,
					borderTop: "1px solid var(--dsw-alias-border-subtle)", marginTop: 4,
					cursor: isDragging ? "grabbing" : "grab", userSelect: "none",
					boxShadow: indicatorShadow,
				},
				children: pluginName,
			});
		}

		function PluginNavRow({ row, active, onSelect, onPointerDown, onPointerUp, isDragging, isDragOver, dragDirection }) {
			const indicatorShadow = isDragOver
				? (dragDirection === "up" ? "inset 0 2px 0 0 var(--dsw-alias-label-primary)" : "inset 0 -2px 0 0 var(--dsw-alias-label-primary)")
				: "none";
			return jsxRuntime.jsx("button", {
				type: "button",
				onPointerDown: (e) => onPointerDown(e, row.id),
				onPointerUp,
				onPointerCancel: onPointerUp,
				"data-plugin-id": row.id,
				style: {
					...NAV_CELL, height: 34, padding: "6px 12px 6px 36px", borderRadius: 10,
					fontSize: 13, lineHeight: "20px",
					color: active ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-secondary)",
					background: active ? "var(--dsw-specific-sidebar-nav-item-active)" : "none",
					opacity: isDragging ? 0.3 : 1,
					pointerEvents: isDragging ? "none" : "auto",
					boxShadow: indicatorShadow,
					cursor: isDragging ? "grabbing" : "pointer",
					userSelect: "none",
				},
				title: row.label,
				onClick: isDragging ? undefined : () => onSelect(row.id),
				children: jsxRuntime.jsx("span", { style: NAV_LABEL, children: row.label }),
			});
		}

		function HubPanel({ rows, ctx, activeId, onSelect, onClose }) {
			const active = rows.find((r) => r.id === activeId)?.id ?? rows[0]?.id;
			react.useEffect(() => {
				const onKeyDown = (e) => { if (e.key === "Escape") onClose(); };
				document.addEventListener("keydown", onKeyDown);
				return () => document.removeEventListener("keydown", onKeyDown);
			}, [onClose]);
			const nativeRows = rows.filter((r) => NATIVE_IDS.has(r.id));
			const pluginRows = rows.filter((r) => !NATIVE_IDS.has(r.id));
			const [pluginSectionMap, setPluginSectionMap] = react.useState(() => buildPluginSectionMap());
			react.useEffect(() => {
				// Re-scan if loadCache grows (late-loading plugins).
				let prevKeys = JSON.stringify(Object.keys(pluginSectionMap));
				const interval = setInterval(() => {
					const next = buildPluginSectionMap();
					const nextKeys = JSON.stringify(Object.keys(next));
					if (nextKeys !== prevKeys) {
						prevKeys = nextKeys;
						setPluginSectionMap(next);
					}
				}, 2000);
				return () => clearInterval(interval);
			}, []);
			const [groupOrder, setGroupOrder] = react.useState(() => {
				const stored = loadGroupOrder();
				const discovered = Object.keys(pluginSectionMap);
				const merged = [...stored];
				for (const g of discovered) { if (!merged.includes(g)) merged.push(g); }
				return merged.filter((g) => discovered.includes(g));
			});
			const [sectionOrder, setSectionOrder] = react.useState(() => {
				const stored = loadSectionOrder();
				const result = {};
				for (const g of groupOrder) {
					const discovered = pluginSectionMap[g] || [];
					const sOrder = (stored[g] || []).filter((id) => discovered.includes(id));
					for (const id of discovered) { if (!sOrder.includes(id)) sOrder.push(id); }
					result[g] = sOrder;
				}
				return result;
			});
			// Sync groupOrder/sectionOrder when pluginSectionMap loads async
			const prevMapRef = react.useRef(pluginSectionMap);
			react.useEffect(() => {
				const prev = prevMapRef.current;
				const curr = pluginSectionMap;
				if (curr === prev) return;
				prevMapRef.current = curr;
				setGroupOrder((prevOrder) => {
					const discovered = Object.keys(curr);
					const merged = [...prevOrder];
					for (const g of discovered) { if (!merged.includes(g)) merged.push(g); }
					return merged.filter((g) => discovered.includes(g));
				});
				setSectionOrder((prevOrder) => {
					const result = {};
					for (const g of Object.keys(curr)) {
						const discovered = curr[g] || [];
						const sOrder = (prevOrder[g] || []).filter((id) => discovered.includes(id));
						for (const id of discovered) { if (!sOrder.includes(id)) sOrder.push(id); }
						result[g] = sOrder;
					}
					return result;
				});
			}, [pluginSectionMap]);
			const flatItems = react.useMemo(() => {
				const items = [];
				for (const g of groupOrder) {
					items.push({ type: "group", pluginName: g, id: "__group__" + g });
					const secs = (sectionOrder[g] || []).map((id) => pluginRows.find((r) => r.id === id)).filter(Boolean);
					for (const s of secs) { items.push({ type: "section", ...s, pluginName: g }); }
				}
				return items;
			}, [groupOrder, sectionOrder, pluginRows]);
			const [draggingId, setDraggingId] = react.useState(null);
			const [dragOver, setDragOver] = react.useState({ id: null, direction: "down" });
			// --- Long-press drag reorder (pointer events, localStorage) ---
			// Mutable ref for document handlers (avoids stale closures).
			const dragRef = react.useRef({
				downId: null, downX: 0, downY: 0,
				draggingId: null, dragOverId: null, targetIdx: 0, sortedRows: [], lastY: 0,
			});
			dragRef.current.flatItems = flatItems;
			dragRef.current.groupOrder = groupOrder;
			dragRef.current.sectionOrder = sectionOrder;

			// Pointer-down: record start position, measure row height.
			const handlePointerDown = react.useCallback((e, id) => {
				if (e.button !== 0) return;
				const ref = dragRef.current;
				ref.downId = id;
				ref.downX = e.clientX;
				ref.downY = e.clientY;
				ref.lastY = e.clientY;
				ref.targetIdx = 0;
			}, []);

			// Pointer-up: finalize reorder, reset all state.
			const handlePointerUp = react.useCallback(() => {
				const ref = dragRef.current;
				if (ref.draggingId && ref.dragOverId && ref.draggingId !== ref.dragOverId) {
					const isGroupDrag = ref.draggingId.startsWith("__group__");
					if (isGroupDrag) {
						const pluginName = ref.draggingId.slice(9);
						const fromIdx = ref.groupOrder.indexOf(pluginName);
						const items = ref.flatItems;
						let toIdx = 0;
						for (let i = 0; i < items.length; i++) {
							if (items[i].id === ref.dragOverId) {
								toIdx = items[i].type === "group" ? i : items.findIndex((x) => x.type === "group" && x.pluginName === items[i].pluginName);
								break;
							}
						}
						if (fromIdx !== -1 && fromIdx !== toIdx) {
							const newOrder = [...ref.groupOrder];
							newOrder.splice(fromIdx, 1);
							newOrder.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, pluginName);
							saveGroupOrder(newOrder);
							setGroupOrder(newOrder);
						}
					} else {
						const draggedItem = ref.flatItems.find((x) => x.id === ref.draggingId);
						if (draggedItem && draggedItem.pluginName) {
							const g = draggedItem.pluginName;
							const secIds = [...(ref.sectionOrder[g] || [])];
							const fromIdx = secIds.indexOf(ref.draggingId);
							const overItem = ref.flatItems.find((x) => x.id === ref.dragOverId);
							const toIdx = secIds.indexOf(ref.dragOverId);
							if (overItem && overItem.type === "section" && overItem.pluginName === g && fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
								secIds.splice(fromIdx, 1);
								secIds.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, ref.draggingId);
								const newSectionOrder = { ...ref.sectionOrder, [g]: secIds };
								saveSectionOrder(newSectionOrder);
								setSectionOrder(newSectionOrder);
							}
						}
					}
				}
				ref.downId = null;
				ref.draggingId = null;
				ref.dragOverId = null;
				setDraggingId(null);
				setDragOver({ id: null, direction: "down" });
			}, []);

			// Document-level pointermove/pointerup: always live while panel is open.
			react.useEffect(() => {
				const onMove = (e) => {
					const ref = dragRef.current;
					if (!ref.downId) return;
					// First move >5px after mousedown → enter drag mode.
					if (!ref.draggingId) {
						const dx = e.clientX - ref.downX;
						const dy = e.clientY - ref.downY;
						if (Math.abs(dx) + Math.abs(dy) > 5) {
							ref.draggingId = ref.downId;
							setDraggingId(ref.downId);
						}
						return;
					}
					// Direction-aware midpoint detection (skip dragged row).
					const allDraggables = [...document.querySelectorAll("[data-plugin-id]")];
					const draggedItem = ref.flatItems.find((x) => x.id === ref.draggingId);
					const isSectionDrag = draggedItem && draggedItem.type === "section";
					const allRows = isSectionDrag
						? allDraggables.filter((el) => {
							const item = ref.flatItems.find((x) => x.id === el.dataset.pluginId);
							return item && item.type === "section" && item.pluginName === draggedItem.pluginName;
						})
						: allDraggables.filter((el) => el.dataset.pluginId !== ref.draggingId);
					const dir = e.clientY > ref.lastY ? "down" : "up";
					ref.lastY = e.clientY;
					let newTargetIdx = null;
					for (let i = 0; i < allRows.length; i++) {
						const rect = allRows[i].getBoundingClientRect();
						if (e.clientY < rect.top || e.clientY > rect.bottom) continue;
						const mid = rect.top + rect.height / 2;
						if (dir === "down" && e.clientY > mid) {
							newTargetIdx = i;
						} else if (dir === "up" && e.clientY < mid) {
							newTargetIdx = i;
						}
					}
					if (newTargetIdx !== null) {
						// Map filtered index back to original index for insertion.
						const filteredEl = allRows[newTargetIdx];
						const origRows = [...document.querySelectorAll("[data-plugin-id]")];
						const origIdx = origRows.indexOf(filteredEl);
						ref.targetIdx = dir === "up" ? origIdx : origIdx + 1;
						const overId = filteredEl?.dataset.pluginId ?? null;
						if (overId !== ref.dragOverId) {
							ref.dragOverId = overId;
							setDragOver({ id: overId, direction: dir });
						}
					} else if (ref.dragOverId) {
						ref.dragOverId = null;
						setDragOver({ id: null, direction: "down" });
					}
				};
				const onUp = () => handlePointerUp();
				document.addEventListener("pointermove", onMove);
				document.addEventListener("pointerup", onUp);
				return () => {
					document.removeEventListener("pointermove", onMove);
					document.removeEventListener("pointerup", onUp);
				};
			}, [handlePointerUp]);

			// Group opens by default when a child row is the active selection.
			const [groupOpen, setGroupOpen] = react.useState(flatItems.some((x) => x.type === "section" && x.id === active));
			return jsxRuntime.jsxs("div", {
				style: { position: "fixed", inset: 0, zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" },
				role: "presentation",
				children: [
					jsxRuntime.jsx("div", { style: { position: "absolute", inset: 0, background: "var(--dsw-alias-bg-mask-1)" }, onClick: onClose }),
					jsxRuntime.jsxs("div", {
						style: {
							position: "relative", zIndex: 1, display: "flex", overflow: "hidden", borderRadius: 24,
							background: "var(--dsw-alias-bg-layer-2)", width: 800, maxWidth: "calc(100vw - 48px)",
							height: "min(800px, 100vh - 48px)", boxShadow: "var(--dsw-shadow-lv3)",
						},
						role: "dialog", "aria-modal": "true",
						children: [
							jsxRuntime.jsxs("nav", {
								style: { display: "flex", flexDirection: "column", flex: "none", gap: 18, width: 188, padding: "22px 12px 0", boxSizing: "border-box" },
								children: [
									jsxRuntime.jsx("div", { style: { color: "var(--dsw-alias-label-primary)", padding: "0 12px", fontSize: 16, fontWeight: 500, lineHeight: "24px" }, children: "设置" }),
									jsxRuntime.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
										nativeRows.map((row) => jsxRuntime.jsx(NavRow, { row, active: row.id === active, onSelect }, row.id)),
										pluginRows.length > 0 && jsxRuntime.jsxs("div", { children: [
											jsxRuntime.jsx(GroupRow, {
												open: groupOpen,
												onToggle: () => setGroupOpen((v) => !v),
												label: "扩展设置项",
											}),
											groupOpen && jsxRuntime.jsx("div", { children:
												flatItems.map((item) => item.type === "group"
													? jsxRuntime.jsx(PluginGroupSeparator, {
														pluginName: item.pluginName,
														onPointerDown: handlePointerDown,
														onPointerUp: handlePointerUp,
														isDragging: draggingId === item.id,
														isDragOver: dragOver.id === item.id && draggingId !== item.id,
														dragDirection: dragOver.direction,
													}, item.id)
													: jsxRuntime.jsx(PluginNavRow, {
														row: item,
														active: item.id === active,
														onSelect,
														onPointerDown: handlePointerDown,
														onPointerUp: handlePointerUp,
														isDragging: draggingId === item.id,
														isDragOver: dragOver.id === item.id && draggingId !== item.id,
														dragDirection: dragOver.direction,
													}, item.id)
												),
											}),
										] }, "dsh-settings-hub.group"),
									] }),
								],
							}),
							jsxRuntime.jsxs("div", { style: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }, children: [
								jsxRuntime.jsx("div", { style: { display: "flex", justifyContent: "space-between", height: 54, padding: "20px 14px 8px 10px", boxSizing: "border-box" }, children:
									jsxRuntime.jsx("button", {
										type: "button", onClick: onClose, "aria-label": "关闭",
										style: { width: 28, height: 28, border: "none", borderRadius: 28, background: "none", cursor: "pointer", color: "var(--dsw-alias-label-primary)", marginLeft: "auto", display: "inline-flex", justifyContent: "center", alignItems: "center" },
										children: jsxRuntime.jsx(primitives.IconCloseOutline16, { size: 14 }),
									}),
								}),
								jsxRuntime.jsx("div", { style: { flex: 1, minHeight: 0, padding: "0 24px 24px", overflowY: "auto" }, children:
									active !== undefined && jsxRuntime.jsx(HubSectionOutlet, { ctx, ownerProps: { close: onClose }, only: active }),
								}),
							] }),
						],
					}),
				],
			});
		}

		/**
		 * Hub root — replaces SettingsRoot in the sidebar.settings cell.
		 * Receives the official standard kit (wide, useSections …) through the
		 * ordinary renderer pipeline; `ctx` rides the inject face.
		 */
		function HubRoot(props) {
			const { wide, useSections } = props;
			const [open, setOpen] = react.useState(false);
			const [activeId, setActiveId] = react.useState(undefined);
			const rows = useSections((s) => s);
			const close = react.useCallback(() => { setOpen(false); setActiveId(undefined); }, []);
			return jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
				jsxRuntime.jsxs("button", {
					type: "button",
					style: {
						boxSizing: "border-box", cursor: "pointer", width: "calc(100% + 4px)", height: 42,
						color: "var(--dsw-alias-label-primary)", background: "none", border: "none", borderRadius: 12,
						flex: "none", alignItems: "center", gap: 8, margin: "4px -2px", padding: "0 10px 0 8px",
						fontFamily: "inherit", fontSize: 14, lineHeight: "22px", display: "flex", overflow: "hidden",
					},
					"aria-haspopup": "dialog",
					"aria-expanded": open,
					onClick: () => setOpen(true),
					children: [
						wide ? jsxRuntime.jsx(primitives.IconSettingsOutline16, { size: 16 }) : jsxRuntime.jsx(primitives.IconSettingsOutline14, { size: 18 }),
						wide && jsxRuntime.jsx("span", { style: { whiteSpace: "nowrap", overflow: "hidden" }, children: "设置" }),
					],
				}),
				open && jsxRuntime.jsx(HubPanel, { rows, ctx: props.ctx, activeId, onSelect: setActiveId, onClose: close }),
			] });
		}

		/* ---------------------------------------- *
		 * Plugin apply: shadow sidebar.settings.   *
		 * ---------------------------------------- */

		// Only the hover affordance lives in CSS — everything else is inline
		// style so the rows share the exact NAV_CELL metrics object.
		const css = `
.dshub-group-toggle:hover{background:var(--dsw-specific-sidebar-nav-item-hover)}
`;
		function ensureStyles() {
			if (document.querySelector("style[data-plugin='dsh-settings-hub']")) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-settings-hub";
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		const inject = ["slots"];
		function apply(ctx) {
			ensureStyles();
			// uSES feed over the settings.section WINNERS (entriesOfSlot): one row
			// per cell id, sorted by order. Native ids stay in the feed — HubPanel
			// splits them out.
			let rowsVersion = -1;
			let rows = [];
			const shellInjected = () => ({
				ctx,
				hooks: {
					sections: {
						getSnapshot: () => {
							const version = ctx.slots.getVersion("settings.section");
							if (version !== rowsVersion) {
								rowsVersion = version;
								rows = ctx.slots.entriesOfSlot("settings.section")
									.map((e) => ({
										id: e.options.id ?? "",
										order: e.options.order ?? 0,
										label: slotsPkg.resolveSlotLabel(e.options.label) ?? "",
									}))
									.sort((a, b) => a.order - b.order);
							}
							return rows;
						},
						subscribe: (listener) => ctx.slots.subscribe("settings.section", listener),
					},
				},
			});
			ctx.slots.inject("sidebar.settings", () => ctx.slots.register({
				name: "sidebar.settings",
				priority: -100, // lowest priority renders → shadows the shipped shell
				inject: shellInjected,
			}, HubRoot));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
