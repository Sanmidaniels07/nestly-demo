// Exports the Nestly brand-kit characters as SVGs for the demo:
//   public/demo/people/{name}.svg        head-and-shoulders avatar (square)
//   public/demo/people/{name}-full.svg   full 400x520 figure, used by the story guide
// Usage: node scripts/export-cast.cjs [path-to-brand-kit/_source-set3/kit.js]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const kitPath = process.argv[2] || path.join(__dirname, "../../Nestly-Brand-Kit/_source-set3/kit.js");
const ctx = { t: 0, Math, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(kitPath, "utf8") + "\n;this.__kit = { person, CAST };", ctx);
const { person, CAST } = ctx.__kit;

// More looks for the demo's extra shoppers and sellers (same drawing system).
const SKIN = { deep: "#5b3a24", brown: "#7a4a2a", warm: "#8d5a35", tan: "#a8704a" };
const EXTRA = {
  emeka: { skin: SKIN.deep, hair: "low", top: "#14b8a6", top2: "#fff", beard: true },
  funmi: { skin: SKIN.warm, hair: "braids", top: "#e11d48", top2: "#fff", earrings: true },
  ngozi: { skin: SKIN.brown, hair: "puff", top: "#8b5cf6", top2: "#fff" },
  segun: { skin: SKIN.tan, hair: "afro", top: "#22c55e", top2: "#fff", glasses: true },
  amaka: { skin: SKIN.brown, hair: "bun", top: "#f43f5e", top2: "#fff", earrings: true },
  yusuf: { skin: SKIN.deep, hair: "low", top: "#3b82f6", top2: "#fff" },
};
const all = { ...CAST, ...EXTRA };
const out = path.join(__dirname, "../public/demo/people");
fs.mkdirSync(out, { recursive: true });

const BG = ["#ede9fe", "#fce7f3", "#e0f2fe", "#dcfce7", "#ffedd5", "#e0e7ff", "#fee2e2", "#ccfbf1", "#fef3c7"];
Object.entries(all).forEach(([name, look], i) => {
  const smile = person(look, { mouth: "smile", brows: "normal" });
  const wave = person(look, { mouth: "grin", brows: "up", armR: [150, 40] });
  // Avatar: crop to the head and shoulders on a soft circle-friendly square.
  fs.writeFileSync(
    path.join(out, `${name}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="80 62 240 240"><rect x="80" y="62" width="240" height="240" fill="${BG[i % BG.length]}"/>${smile}</svg>`
  );
  fs.writeFileSync(path.join(out, `${name}-full.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520">${wave}</svg>`);
});
console.log("exported", Object.keys(all).length, "characters to", out);
