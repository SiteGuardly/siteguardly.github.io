(() => {
  'use strict';

  const routes = [
    {
      title: 'Midden in het spel',
      description: 'Een herkenbaar billboard, merkobject of activatie in een bestaande game. Kies een plek die past bij hoe spelers die wereld ontdekken.',
      type: 'In-game advertenties',
      name: 'Neon Run',
      example: 'Een digitaal billboard aan een populaire route en een verzamelitem dat spelers onderweg kunnen vinden.'
    },
    {
      title: 'Een wereld van je eigen merk',
      description: 'Van eerste spelidee tot lancering. We vertalen je merk naar een eigen Roblox-game met een reden om terug te blijven komen.',
      type: 'Eigen branded game',
      name: 'Candy Quest',
      example: 'Een herkenbare spelwereld waarin spelers korte hindernisbanen afleggen en onderweg nieuwe levels ontgrendelen.'
    },
    {
      title: 'Maak van lancering een moment',
      description: 'Breng je campagne onder de aandacht via Roblox-groepen en YouTubers die aansluiten bij de wereld en de beoogde doelgroep.',
      type: 'Creators & community',
      name: 'Creator Drop',
      example: 'Een introductie door creators, gevolgd door een tijdelijk evenement dat de community samen in de game ontdekt.'
    }
  ];

  const find = (id) => document.getElementById(id);
  const routeButtons = [...document.querySelectorAll('[data-route]')];
  const caseButtons = [...document.querySelectorAll('[data-case]')];
  const caseImages = [...document.querySelectorAll('[data-case-image]')];
  const form = find('intake');
  let activeRoute = 0;
  let scene;

  function pressOnly(buttons, index) {
    buttons.forEach((button, position) => {
      button.setAttribute('aria-pressed', String(position === index));
    });
  }

  function selectCase(index) {
    const selected = routes[index];
    if (!selected) return;
    pressOnly(caseButtons, index);
    find('case-type').textContent = selected.type;
    find('case-name').textContent = selected.name;
    find('case-description').textContent = selected.example;
    caseImages.forEach((image, position) => {
      image.hidden = position !== index;
    });
  }

  function selectRoute(index) {
    const selected = routes[index];
    if (!selected) return;
    activeRoute = index;
    pressOnly(routeButtons, index);
    find('route-nr').textContent = String(index + 1).padStart(2, '0');
    find('route-title').textContent = selected.title;
    find('route-copy').textContent = selected.description;
    scene?.setMode(index);
  }

  scene = window.OrbitScene?.init(find('orbital'), { onPick: selectRoute });
  routeButtons.forEach((button, index) => button.addEventListener('click', () => selectRoute(index)));
  caseButtons.forEach((button, index) => button.addEventListener('click', () => selectCase(index)));
  document.querySelectorAll('[data-turn]').forEach((button) => {
    button.addEventListener('click', () => scene?.rotate(Number(button.dataset.turn) * 0.48));
  });
  find('route-case').addEventListener('click', () => selectCase(activeRoute));
  find('route-apply').addEventListener('click', () => {
    form.elements.route.value = String(activeRoute);
  });

  const fieldsets = [...form.querySelectorAll('fieldset')];
  const back = find('form-back');
  const next = find('form-next');
  const success = find('form-success');
  const progress = find('form-progress');
  const progressBar = find('form-bar');
  const booking = find('booking-example');
  let currentStep = 0;

  function showStep(index, moveFocus) {
    currentStep = index;
    fieldsets.forEach((fieldset, position) => {
      fieldset.hidden = position !== index;
      fieldset.disabled = position !== index;
    });
    back.hidden = index === 0;
    next.firstChild.textContent = index === fieldsets.length - 1 ? 'Toon bevestiging ' : 'Volgende ';
    progress.textContent = 'Stap ' + (index + 1) + ' van ' + fieldsets.length;
    progressBar.value = index + 1;
    if (moveFocus) fieldsets[index].querySelector('input, select')?.focus();
  }

  back.addEventListener('click', () => showStep(currentStep - 1, true));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (currentStep < fieldsets.length - 1) {
      showStep(currentStep + 1, true);
      return;
    }
    form.reset();
    form.hidden = true;
    success.hidden = false;
    success.focus();
    progress.textContent = 'Intake afgerond';
  });
  find('schedule').addEventListener('click', () => {
    booking.hidden = !booking.hidden;
    find('schedule').setAttribute('aria-expanded', String(!booking.hidden));
  });
  find('form-reset').addEventListener('click', () => {
    booking.hidden = true;
    find('schedule').setAttribute('aria-expanded', 'false');
    success.hidden = true;
    form.hidden = false;
    showStep(0, true);
  });
  showStep(0, false);
})();
