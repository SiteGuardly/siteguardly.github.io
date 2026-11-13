const filters = document.querySelectorAll('[data-filter]');
const projects = document.querySelectorAll('[data-categories]');
const filterStatus = document.querySelector('#filter-status');
document.querySelector('.filters').hidden = false;

for (const filter of filters) {
  filter.addEventListener('click', () => {
    const value = filter.dataset.filter;
    for (const button of filters) {
      button.classList.toggle('active', button === filter);
      button.setAttribute('aria-pressed', String(button === filter));
    }
    let shown = 0;
    for (const project of projects) {
      const categories = project.dataset.categories.split(' ');
      project.hidden = value !== 'all' && !categories.includes(value);
      if (!project.hidden) shown++;
    }
    filterStatus.textContent = shown + (shown === 1 ? ' project shown' : ' projects shown');
  });
}

document.querySelector('#year').textContent = new Date().getFullYear();

