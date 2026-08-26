// dsh-settings-hub node half — intentionally inert.
// The plugin's entire behavior lives in the browser half (lib/client.js):
// it shadows sidebar.settings and regroups third-party settings sections.
export const name = 'dsh-settings-hub';
export const inject = [];
export function apply() {}
