/* ─────────────────────────────────────────────────
   MovieStar v3 · Frontend JS
───────────────────────────────────────────────── */

// ── Navbar solid on scroll ───────────────────────
const navbar = document.getElementById('navbar');
if (navbar) window.addEventListener('scroll', () =>
  navbar.classList.toggle('solid', window.scrollY > 60));

// ── Mobile menu ──────────────────────────────────
const hburg = document.getElementById('hburg');
const mmenu = document.getElementById('mmenu');
if (hburg && mmenu) {
  hburg.addEventListener('click', () => {
    const open = mmenu.style.display === 'flex';
    mmenu.style.display = open ? 'none' : 'flex';
  });
  document.addEventListener('click', e => {
    if (!hburg.contains(e.target) && !mmenu.contains(e.target))
      mmenu.style.display = 'none';
  });
}

// ── Live Search ───────────────────────────────────
const si = document.getElementById('searchInput');
const sd = document.getElementById('searchDrop');
let stimer;
if (si && sd) {
  si.addEventListener('input', () => {
    clearTimeout(stimer);
    const q = si.value.trim();
    if (q.length < 2) { sd.style.display = 'none'; sd.innerHTML = ''; return; }
    stimer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/movies?search=${encodeURIComponent(q)}&limit=7`);
        const d = await r.json();
        if (!d.data?.length) {
          sd.innerHTML = '<div style="padding:13px 15px;color:var(--txt3);font-size:.83rem">No results</div>';
        } else {
          sd.innerHTML = d.data.map(m => `
            <a href="/movie/${m._id}" class="sdi">
              <img src="${m.image}" alt="" onerror="this.src='/images/placeholder.svg'"/>
              <div>
                <div class="sdn">${esc(m.title)}</div>
                <div class="sdm">${esc(m.language)} · ${m.releaseDate ? new Date(m.releaseDate).getFullYear() : ''}</div>
              </div>
            </a>`).join('');
        }
        sd.style.display = 'block';
      } catch { /* ignore */ }
    }, 280);
  });
  document.addEventListener('click', e => {
    if (!si.contains(e.target) && !sd.contains(e.target)) sd.style.display = 'none';
  });
}

// ── Filter Pills (homepage) ───────────────────────
const pills   = document.querySelectorAll('.pill');
const shelves = document.querySelectorAll('.shelf');

pills.forEach(pill => {
  pill.addEventListener('click', () => {
    pills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const f = pill.dataset.filter;

    shelves.forEach(shelf => {
      if (f === 'all') { shelf.style.display = ''; return; }
      const cards = shelf.querySelectorAll('.mcard');
      let   vis   = 0;
      cards.forEach(card => {
        const lang    = (card.querySelector('.ltag')?.textContent || '').toLowerCase();
        const isTrend = !!card.querySelector('.bred');
        const isUp    = !!card.querySelector('.bpurple');
        let show = false;
        if      (f === 'trending')  show = isTrend;
        else if (f === 'upcoming')  show = isUp;
        else                        show = lang.includes(f);
        card.style.display = show ? '' : 'none';
        if (show) vis++;
      });
      shelf.style.display = vis === 0 ? 'none' : '';
    });
  });
});

// Apply ?filter= from URL on page load
const urlF = new URLSearchParams(window.location.search).get('filter');
if (urlF) {
  const p = [...pills].find(p => p.dataset.filter === urlF);
  if (p) p.click();
}

// ── Star Picker ───────────────────────────────────
const spWrap  = document.getElementById('sp');
const rval    = document.getElementById('rval');
const rlabel  = document.getElementById('rlabel');
const LABELS  = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'];

if (spWrap) {
  const stars = spWrap.querySelectorAll('.sp');
  stars.forEach(s => {
    s.addEventListener('mouseover', () => hlStars(parseInt(s.dataset.v)));
    s.addEventListener('click', () => {
      const v = parseInt(s.dataset.v);
      rval.value = v;
      if (rlabel) rlabel.textContent = `Rated: ${LABELS[v]}`;
      hlStars(v, true);
    });
  });
  spWrap.addEventListener('mouseleave', () => hlStars(parseInt(rval?.value || 0), !!rval?.value));
}
function hlStars(n, lock = false) {
  document.querySelectorAll('#sp .sp').forEach((s, i) => {
    s.classList.toggle('lit', i < n);
    if (lock) s.style.color = i < n ? 'var(--gold)' : '';
  });
}

// ── Char counter ──────────────────────────────────
const cbox = document.getElementById('cbox');
const cc   = document.getElementById('cc');
if (cbox && cc) {
  cbox.addEventListener('input', () => {
    cc.textContent = cbox.value.length;
    cc.style.color = cbox.value.length > 900 ? 'var(--red)' : '';
  });
}

// ── Review Form Submit ────────────────────────────
const reviewForm = document.getElementById('reviewForm');
if (reviewForm) {
  reviewForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!window._LOGGED_IN) { location.href = window._LOGIN_URL; return; }

    const rating  = rval?.value;
    const comment = cbox?.value.trim();
    const rvOk    = document.getElementById('rv-ok');
    const rvErr   = document.getElementById('rv-err');
    const btn     = document.getElementById('submitBtn');
    const lbl     = document.getElementById('btnLbl');
    const spin    = document.getElementById('btnSpin');

    if (!rating)            return setErr(rvErr, 'Please select a star rating.');
    if (comment.length < 5) return setErr(rvErr, 'Review must be at least 5 characters.');

    hide(rvErr);
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
  document.querySelector('.empty-rv')?.remove();
  const badge = document.getElementById('rcount');
  if (badge) badge.textContent = parseInt(badge.textContent || 0) + 1;

  const stars = Array.from({ length: 5 }, (_, i) =>
    `<i class="fas fa-star ${i < r.rating ? 'son' : 'soff'}"></i>`).join('');
  const date  = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  const init  = r.userId.username.charAt(0).toUpperCase();

  const card = document.createElement('div');
  card.className = 'rcard';
  card.innerHTML = `
    <div class="rcard-head">
      <div class="rcard-left">
        <div class="rc-av">${init}</div>
        <div><a href="/profile/${esc(r.userId.username)}" class="rc-name rc-name-link">${esc(r.userId.username)}</a><small>${date}</small></div>
      </div>
      <div class="rcard-right">
        <div class="rc-stars">${stars}<span class="rbadge">${r.rating}/5</span></div>
      </div>
    </div>
    <p class="rc-comment">${esc(r.comment)}</p>
    <div class="rc-actions">
      <button class="like-btn" onclick="likeReview(this)" data-id="${r._id}">
        <i class="far fa-heart"></i><span class="lcount">0</span>
      </button>
    </div>`;

  const list = document.getElementById('reviewsList');
  if (list) list.prepend(card);
  else {
    const wrap = document.querySelector('.rlist-wrap');
    const nl = Object.assign(document.createElement('div'), { id: 'reviewsList' });
    nl.appendChild(card);
    wrap?.appendChild(nl);
  }
}

// ── Like a review ─────────────────────────────────
async function likeReview(btn) {
  if (!window._LOGGED_IN) { location.href = window._LOGIN_URL; return; }
  const id = btn.dataset.id;
  try {
    const res  = await fetch(`/api/review/${id}/like`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      btn.classList.toggle('liked', data.liked);
      btn.querySelector('i').className = data.liked ? 'fas fa-heart' : 'far fa-heart';
      btn.querySelector('.lcount').textContent = data.likeCount;
    }
  } catch { /* ignore */ }
}

// ── Follow a user ─────────────────────────────────
async function toggleFollow(btn) {
  if (!window._LOGGED_IN) { location.href = window._LOGIN_URL; return; }
  const uid = btn.dataset.uid;
  try {
    const res  = await fetch(`/api/follow/${uid}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      btn.classList.toggle('following', data.following);
      btn.querySelector('span').textContent = data.following ? 'Following' : 'Follow';
      btn.querySelector('i').className = data.following ? 'fas fa-user-check' : 'fas fa-user-plus';
    }
  } catch { /* ignore */ }
}

// ── Admin: Pin review ─────────────────────────────
async function pinReview(btn) {
  if (!window._IS_ADMIN) return;
  const id = btn.dataset.id;
  try {
    const res  = await fetch(`/admin/review/${id}/pin`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      const card = btn.closest('.rcard');
      card.classList.toggle('pinned', data.pinned);
      btn.querySelector('i').classList.toggle('pinned-icon', data.pinned);
      btn.title = data.pinned ? 'Unpin' : 'Pin';
      // move to top if pinned
      if (data.pinned) {
        const list = document.getElementById('reviewsList');
        if (list) list.prepend(card);
      }
    }
  } catch { /* ignore */ }
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Smooth anchor scroll ──────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const t = document.querySelector(a.getAttribute('href'));
    if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
});

// ── Profile: reviewer name link in newly added cards ──
// Already handled in prependReview — username links to /profile/username

// ── Highlight active nav link ──────────────────────
(function(){
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(a => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });
  document.querySelectorAll('.sb-link').forEach(a => {
    if (window.location.pathname.startsWith(a.getAttribute('href')) && a.getAttribute('href') !== '/')
      a.classList.add('active');
  });
})();
