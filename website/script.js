(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  // Hero intro
  requestAnimationFrame(() => document.body.classList.add('loaded'));

  // Year
  document.getElementById('year').textContent = new Date().getFullYear();

  // Nav: solid on scroll, hide on scroll down
  const nav = document.getElementById('nav');
  let lastY = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > 40);
    nav.classList.toggle('hidden', y > lastY && y > 400 && !document.body.classList.contains('menu-open'));
    lastY = y;
  }, { passive: true });

  // Mobile menu
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.getElementById('mobileMenu');
  const setMenu = (open) => {
    document.body.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', open);
    menu.setAttribute('aria-hidden', !open);
  };
  toggle.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));

  // Split statement into words for scroll-scrubbed highlight
  const statement = document.querySelector('.split-reveal');
  if (statement) {
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part.trim()) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement('span');
            s.className = 'w';
            s.textContent = part;
            frag.appendChild(s);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    };
    walk(statement);
    const words = statement.querySelectorAll('.w');
    const onScroll = () => {
      const r = statement.getBoundingClientRect();
      const vh = window.innerHeight;
      const progress = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
      const lit = Math.round(progress * words.length);
      words.forEach((w, i) => w.classList.toggle('on', i < lit));
    };
    if (reduceMotion) words.forEach((w) => w.classList.add('on'));
    else { window.addEventListener('scroll', onScroll, { passive: true }); onScroll(); }
  }

  // Reveal on view + counters
  const countUp = (el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const suffix = el.dataset.suffix || '';
    if (reduceMotion) { el.textContent = target.toFixed(decimals) + suffix; return; }
    const start = performance.now();
    const dur = 1800;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = (target * eased).toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      // stagger siblings
      const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal') || c.classList.contains('step'));
      el.style.transitionDelay = `${Math.max(0, siblings.indexOf(el)) * 0.08}s`;
      el.classList.add('in');
      el.querySelectorAll('[data-count]').forEach(countUp);
      io.unobserve(el);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal, .step').forEach((el) => io.observe(el));

  // Active nav link
  const links = document.querySelectorAll('.nav-links a');
  const sectionIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === `#${e.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['services', 'work', 'process', 'about'].forEach((id) => {
    const s = document.getElementById(id);
    if (s) sectionIO.observe(s);
  });

  // Testimonial slider
  const quotes = document.querySelectorAll('.quote');
  const dots = document.querySelectorAll('.quote-dots button');
  let qi = 0;
  let qTimer;
  const showQuote = (i) => {
    qi = i;
    quotes.forEach((q, n) => q.classList.toggle('active', n === i));
    dots.forEach((d, n) => d.classList.toggle('active', n === i));
  };
  const autoplay = () => {
    clearInterval(qTimer);
    if (!reduceMotion) qTimer = setInterval(() => showQuote((qi + 1) % quotes.length), 6000);
  };
  dots.forEach((d, i) => d.addEventListener('click', () => { showQuote(i); autoplay(); }));
  autoplay();

  if (!finePointer || reduceMotion) return;

  // Cursor glow
  const glow = document.querySelector('.cursor-glow');
  let gx = 0, gy = 0, tx = 0, ty = 0;
  window.addEventListener('mousemove', (e) => {
    tx = e.clientX; ty = e.clientY;
    document.body.classList.add('has-cursor');
  });
  const loop = () => {
    gx += (tx - gx) * 0.12;
    gy += (ty - gy) * 0.12;
    glow.style.transform = `translate(${gx - 260}px, ${gy - 260}px)`;
    requestAnimationFrame(loop);
  };
  loop();

  // Spotlight on service cards
  document.querySelectorAll('.service').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  // Magnetic buttons
  document.querySelectorAll('.magnetic').forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      btn.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
})();
