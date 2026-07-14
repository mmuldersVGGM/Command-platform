
'use strict';
document.addEventListener('DOMContentLoaded', () => {
  document.title = 'Command Platform v32.2';
  const heading = document.querySelector('.app-header h1, header h1');
  if (heading) heading.textContent = 'Command Platform v32.2';
  const label = document.getElementById('versionLabel');
  if (label) label.textContent = 'v32.2';
});
