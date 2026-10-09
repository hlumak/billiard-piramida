/** id of a TabList tab and of the panel it controls, for `aria-labelledby`. */
export const tabId = (idBase: string, id: string) => `${idBase}-tab-${id}`;
export const tabPanelId = (idBase: string) => `${idBase}-panel`;
