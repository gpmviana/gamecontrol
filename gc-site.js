'use strict';
(() => {
  // Permitir também a revisão do ficheiro local antes da publicação.
  if (location.protocol === 'file:') {
    document.querySelectorAll('a[href="app.html"], a[href="registar.html"]').forEach(link => {
      link.href = 'https://gpmviana.github.io/gamecontrol/' + link.getAttribute('href');
    });
  }
  const tabs = [...document.querySelectorAll('[data-preview]')];
  function activate(tab) {
    tabs.forEach(button => {
      const active = button === tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      document.getElementById('preview-' + button.dataset.preview).hidden = !active;
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      activate(tabs[next]);
      tabs[next].focus();
    });
  });
  const menu = document.querySelector('.menu-toggle');
  const nav = document.getElementById('main-nav');
  function closeMenu() {
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'Abrir menu');
    nav.dataset.open = 'false';
  }
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    nav.dataset.open = String(open);
  });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      menu.focus();
    }
  });
  let lastDialogTrigger;
  const contact = document.getElementById('contact-dialog');
  const image = document.getElementById('image-dialog');
  function openDialog(dialog, trigger) {
    lastDialogTrigger = trigger;
    dialog.showModal();
  }
  document.querySelectorAll('[data-close-dialog]').forEach(button => {
    button.addEventListener('click', () => button.closest('dialog').close());
  });
  [contact, image].forEach(dialog => {
    dialog.addEventListener('close', () => lastDialogTrigger?.focus());
  });
  const address = 'viana10gfc@gmail.com';
  const plans = {
    treinador: {name:'Treinador', price:50, accounts:1},
    clube: {name:'Clube', price:150, accounts:5}
  };
  function prepareContact(planId) {
    const plan = plans[planId];
    const subject = plan ? 'Game Control — plano ' + plan.name : 'Game Control — pedido de acesso';
    const body = (plan
      ? 'Olá, gostaria de pedir o plano ' + plan.name + ' (' + plan.price + ' € por época, ' + plan.accounts + (plan.accounts===1?' conta pessoal).':' contas pessoais).')
      : 'Olá, gostaria de conhecer o Game Control e pedir informações sobre o acesso ou o teste de 7 dias.')
      + '\n\nNome:\nClube:\nEscalão:\n';
    document.getElementById('contact-title').textContent = plan ? 'Plano ' + plan.name + ' · ' + plan.price + ' € / época' : 'Contactar o Game Control';
    const note = document.getElementById('contact-plan-note');
    note.hidden = !plan;
    note.textContent = plan ? 'No Instagram, indica o plano ' + plan.name + ' no teu pedido.' : '';
    document.getElementById('contact-gmail').href = 'https://mail.google.com/mail/?' + new URLSearchParams({view:'cm', fs:'1', to:address, su:subject, body});
    document.getElementById('contact-mailto').href = 'mailto:' + address + '?' + new URLSearchParams({subject, body}).toString().replace(/\+/g, '%20');
    document.getElementById('contact-status').textContent = '';
  }
  prepareContact();
  document.querySelectorAll('[data-open-contact], .footer-links a[href^="mailto:"]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      prepareContact();
      openDialog(contact, button);
    });
  });
  document.querySelectorAll('[data-plan]').forEach(button => {
    button.addEventListener('click', () => {
      prepareContact(button.dataset.plan);
      openDialog(contact, button);
    });
  });
  document.getElementById('copy-email').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(address);
      document.getElementById('contact-status').textContent = 'Endereço copiado.';
    } catch (error) {
      const field = document.getElementById('contact-address');
      field.focus();
      field.select();
      document.getElementById('contact-status').textContent = 'Endereço selecionado. Usa a opção Copiar do teu dispositivo.';
    }
  });
  document.querySelectorAll('[data-image]').forEach(button => {
    button.addEventListener('click', () => {
      document.getElementById('image-title').textContent = button.dataset.imageTitle;
      document.getElementById('expanded-image').src = button.dataset.image;
      document.getElementById('expanded-image').alt = button.querySelector('img').alt;
      openDialog(image, button);
    });
  });
})();
