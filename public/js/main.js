/* ─────────────────────────────────────────────────
   MovieStar v2 · Frontend JS
───────────────────────────────────────────────── */

// ── Navbar: solid on scroll ──────────────────────
const navbar = document.getElementById('navbar');
if (navbar) window.addEventListener('scroll', () =>
  navbar.classList.toggle('solid', window.scrollY > 60));

// ── Mobile menu ──────────────────────────────────
const hamburger   = document.getElementById('hamburger');
const mobileMenu  = document.getElementById('mobileMenu');
if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    const open = mobileMenu.style.display === 'flex';
    mobileMenu.style.display = open ? 'none' : 'flex';
  });
}

// ── Live search ───────────────────────────────────
const searchInput    = document.getElementById('searchInput');
const searchDropdown = document.getElementById('searchDropdown');
let   searchTimer;

if (searchInput && searchDropdown) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q.length < 2) { hide(searchDropdown); searchDropdown.innerHTML = ''; return; }

    searchTimer = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/movies?search=${encodeURIComponent(q)}&limit=7`);
        const data = await res.json();
        if (!data.data?.length) {
          searchDropdown.innerHTML = '<div style="padding:13px 15px;color:var(--txt3);font-size:.83rem">No results found</div>';
        } else {
          searchDropdown.innerHTML = data.data.map(m => `
            <a href="/movie/${m._id}" class="sr-item">
              <img src="${m.image}" alt="" onerror="this.src='/images/placeholder.svg'" />
              <div>
                <div class="sr-name">${esc(m.title)}</div>
                <div class="sr-meta">${esc(m.language)} · ${m.releaseDate ? new Date(m.releaseDate).getFullYear() : ''}</div>
              </div>
            </a>`).join('');
        }
        show(searchDropdown);
      } catch { /* ignore */ }
    }, 280);
  });

  document.addEventListener('click', e => {
    if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target))
      hide(searchDropdown);
  });
}

// ── Filter pills (homepage) ───────────────────────
const pills     = document.querySelectorAll('.pill');
const shelves   = document.querySelectorAll('.shelf');

pills.forEach(pill => {
  pill.addEventListener('click', () => {
    pills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const f = pill.dataset.filter;

    shelves.forEach(shelf => {
      if (f === 'all') { shelf.style.display = ''; return; }

      const cards   = shelf.querySelectorAll('.movie-card');
      let   visible = 0;

      cards.forEach(card => {
        const lang      = card.querySelector('.lang-tag')?.textContent.toLowerCase() || '';
        const isTrend   = card.querySelector('.badge-red');
        const isUpcoming= card.querySelector('.badge-purple');

        let show = false;
        if (f === 'trending')  show = !!isTrend;
        else if (f === 'upcoming') show = !!isUpcoming;
        else show = lang.includes(f);

        card.style.display = show ? '' : 'none';
        if (show) visible++;
      });

      shelf.style.display = visible === 0 ? 'none' : '';
    });
  });
});

// ── Handle URL ?filter= param on load ─────────────
const urlFilter = new URLSearchParams(window.location.search).get('filter');
if (urlFilter) {
  const p = [...pills].find(p => p.dataset.filter === urlFilter);
  if (p) p.click();
}

// ── Star picker ───────────────────────────────────
const starPicker   = document.getElementById('starPicker');
const ratingVal    = document.getElementById('ratingVal');
const ratingLabel  = document.getElementById('ratingLabel');
const LABELS       = ['','Poor','Fair','Good','Great','Excellent!'];

if (starPicker) {
  const stars = starPicker.querySelectorAll('.sp');
  stars.forEach(star => {
    star.addEventListener('mouseover', () => highlight(parseInt(star.dataset.v)));
    star.addEventListener('click', () => {
      const v = parseInt(star.dataset.v);
      ratingVal.value = v;
      if (ratingLabel) ratingLabel.textContent = `You rated: ${LABELS[v]}`;
      highlight(v, true);
    });
  });
  starPicker.addEventListener('mouseleave', () => {
    const cur = parseInt(ratingVal?.value || 0);
    highlight(cur, !!cur);
  });

  function highlight(n, lock = false) {
    starPicker.querySelectorAll('.sp').forEach((s, i) => {
      s.classList.toggle('lit', i < n);
      if (lock) s.style.color = i < n ? 'var(--gold)' : '';
    });
  }
}

// ── Char counter ──────────────────────────────────
const commentBox = document.getElementById('commentBox');
const cc         = document.getElementById('cc');
if (commentBox && cc) {
  commentBox.addEventListener('input', () => {
    const len = commentBox.value.length;
    cc.textContent = len;
    cc.style.color = len > 900 ? 'var(--red)' : '';
  });
}

// ── Review form submit ────────────────────────────
const reviewForm = document.getElementById('reviewForm');
if (reviewForm) {
  reviewForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!window._LOGGED_IN) { location.href = window._LOGIN_URL; return; }

    const rating  = ratingVal?.value;
    const comment = commentBox?.value.trim();
    const rvOk    = document.getElementById('rv-success');
    const rvErr   = document.getElementById('rv-error');
    const btn     = document.getElementById('submitBtn');
    const lbl     = document.getElementById('btnLabel');
    const spin    = document.getElementById('btnSpinner');

    if (!rating)          return setErr(rvErr, 'Please select a star rating.');
    if (comment.length < 5) return setErr(rvErr, 'Review must be at least 5 characters.');

    hide(rvErr); rvErr.textContent = '';
    lbl.style.display = 'none'; spin.style.display = '';
    btn.disabled = true;

    try {
      const res  = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movieId: window._MOVIE_ID, rating: parseInt(rating), comment }),
      });
      const data = await res.json();

      if (data.success) {
        reviewForm.style.display = 'none';
        show(rvOk);
        prependReview(data.data);
      } else {
        setErr(rvErr, data.message || 'Submission failed.');
        lbl.style.display = ''; spin.style.display = 'none';
        btn.disabled = false;
      }
    } catch {
      setErr(rvErr, 'Network error. Try again.');
      lbl.style.display = ''; spin.style.display = 'none';
      btn.disabled = false;
    }
  });
}

function prependReview(r) {
  const list = document.getElementById('reviewsList');
  document.querySelector('.empty-reviews')?.remove();

  const badge = document.getElementById('rcount');
  if (badge) badge.textContent = parseInt(badge.textContent || 0) + 1;

  const stars = Array.from({length:5},(_,i)=>
    `<i class="fas fa-star ${i<r.rating?'s-on':'s-off'}"></i>`).join('');
  const date  = new Date(r.createdAt||Date.now())
    .toLocaleDateString('en-IN',{year:'numeric',month:'short',day:'numeric'});
  const init  = r.userId.username.charAt(0).toUpperCase();

  const card  = Object.assign(document.createElement('div'), { className: 'review-card' });
  card.innerHTML = `
    <div class="rc-head">
      <div class="rc-left">
        <div class="rc-avatar">${init}</div>
        <div><strong>${esc(r.userId.username)}</strong><small>${date}</small></div>
      </div>
      <div class="rc-stars">${stars}<span class="rbadge">${r.rating}/5</span></div>
    </div>
    <p class="rc-comment">${esc(r.comment)}</p>`;

  if (list) list.prepend(card);
  else {
    const wrap = document.querySelector('.reviews-list-wrap');
    const nl   = Object.assign(document.createElement('div'), { id: 'reviewsList' });
    nl.appendChild(card);
    wrap?.appendChild(nl);
  }
}

// ── Utilities ─────────────────────────────────────
function show(el) { if (el) el.style.display = ''; }
function hide(el) { if (el) el.style.display = 'none'; }
function setErr(el, msg) {
  if (!el) return;
  el.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
  show(el);
}
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
