let counter = 0;
/** cuid-looking ids, so URLs look like the real app's. */
export const newId = () => `cdemo${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const now = () => new Date().toISOString();
export const daysAgo = (days: number, hours = 0) => new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();
export const inDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
export const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();

export const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
export const code6 = () => String(Math.floor(100000 + Math.random() * 900000));
export const shortCode = (length = 8) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};
export const orderNumber = (id: string) => id.slice(-8).toUpperCase();
