const filters = document.querySelectorAll('[data-filter]');
const projects = document.querySelectorAll('[data-categories]');

for (const filter of filters) {
  filter.addEventListener('click', () => {
    const value = filter.dataset.filter;
    for (const button of filters) {
      button.classList.toggle('active', button === filter);
    }
    for (const project of projects) {
      const categories = project.dataset.categories.split(' ');
      project.classList.toggle('hidden', value !== 'all' && !categories.includes(value));
    }
  });
}

document.querySelector('#year').textContent = new Date().getFullYear();

