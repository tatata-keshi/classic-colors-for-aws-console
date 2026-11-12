const DEFAULTS = {
  enabled: true,
  header: true,
  links: true,
  buttons: true,
  navColor: "#232f3e",
  linkColor: "#295eff",
  primaryColor: "#ec7211"
};

const $ = id => document.getElementById(id);

function render(s) {
  for (const k of ["enabled", "header", "links", "buttons"]) $(k).checked = s[k];
  for (const k of ["navColor", "linkColor", "primaryColor"]) $(k).value = s[k];
  $("parts").classList.toggle("off", !s.enabled);
}

chrome.storage.sync.get(DEFAULTS, render);

for (const k of ["enabled", "header", "links", "buttons"]) {
  $(k).addEventListener("change", e => {
    chrome.storage.sync.set({ [k]: e.target.checked });
    if (k === "enabled") $("parts").classList.toggle("off", !e.target.checked);
  });
}
for (const k of ["navColor", "linkColor", "primaryColor"]) {
  $(k).addEventListener("change", e => chrome.storage.sync.set({ [k]: e.target.value }));
}
