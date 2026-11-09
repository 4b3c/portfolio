// The forest's canvas (templates/projects.html), which everything draws on.
export const canvas = document.getElementById('projects');
export const ctx = canvas.getContext('2d');
export const dpr = Math.min(window.devicePixelRatio || 1, 2);
