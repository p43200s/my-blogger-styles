//<![CDATA[
document.addEventListener('DOMContentLoaded', () => {
  const SEP = '-', MAX = 5, EXPIRY = 86400000; // 24小時快取
  const $ = (s, ctx = document) => ctx.querySelector(s), $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s)), esc = (s) => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  // 1. 選單
  const menuWrap = $('#Label1');
  if (menuWrap) {
    const tree = {};
    $$('ul li a', menuWrap).forEach(a => {
      const parts = a.textContent.trim().split(SEP).map(p => p.trim());
      const p = parts[0], c = parts[1];
      if (!tree[p]) tree[p] = { url: `/search/label/${encodeURIComponent(p)}`, kids: {} };
      if (c) tree[p].kids[c] = a.href;
    });
    const html = `<ul>${Object.keys(tree).map(p => {
      const ks = Object.keys(tree[p].kids), has = ks.length > 0;
      return `<li><div class="menu-item-row"><a href="${tree[p].url}">${esc(p)}</a>${has ? `<span class="toggle-btn">\u25B6</span>` : ''}</div>${has ? `<div class="submenu-content"><ul>${ks.map(c => `<li><a href="${tree[p].kids[c]}">${esc(c)}</a></li>`).join('')}</ul></div>` : ''}</li>`;
    }).join('')}</ul>`;
    menuWrap.innerHTML = (menuWrap.querySelector('h2')?.outerHTML || '') + html;
    menuWrap.onclick = (e) => { const b = e.target.closest('.toggle-btn'); if (b) { e.preventDefault(); b.closest('li').classList.toggle('is-open'); } };
  }

  // 2. 首頁分類
  const home = $('#home-sections');
  if (home) {
    const renderHome = (entries) => {
      const catMap = {}, path = window.location.pathname, curL = path.includes('/search/label/') ? decodeURIComponent(path.split('/label/')[1].split(/[?#]/)[0]) : null;
      entries.forEach(e => e.category?.forEach(c => (catMap[c.term] = catMap[c.term] || []).push(e)));
      const allK = Object.keys(catMap);
      const targets = curL ? [curL, ...allK.filter(k => k.startsWith(curL + SEP))] : allK.filter(k => k.includes(SEP));
      home.innerHTML = `<div class="sections-wrapper">${targets.map(l => {
        const ps = catMap[l] || [], hasSub = allK.some(k => k.startsWith(l + SEP));
        if (!ps.length || (curL && l === curL && hasSub)) return (curL && l === curL && hasSub) ? `<h1 class="parent-label-title">${esc(l)}</h1>` : '';
        const isCollapsed = !curL && ps.length > MAX;
        const displayLimit = isCollapsed ? MAX : 150;
        const remaining = ps.slice(displayLimit);
        const moreBtn = isCollapsed ? `<div class="section-footer"><button class="more-link-btn" data-label="${esc(l)}">顯示更多（${remaining.length}）</button></div>` : '';
        return `<section class="home-label-section" id="sec-${encodeURIComponent(l)}">
          <h2 class="section-title">${esc(l.split(SEP).pop())}</h2>
          <div class="section-posts">
            ${ps.slice(0, displayLimit).map(e => `<div class="section-post-item"><a href="${e.link.find(lk => lk.rel === 'alternate').href}">${esc(e.title.$t)}</a><span>${e.published.$t.slice(0, 10)}</span></div>`).join('')}
          </div>
          ${moreBtn}
        </section>`;
      }).join('')}</div>`;
      home.onclick = (e) => {
        const btn = e.target.closest('.more-link-btn');
        if (!btn) return;
        const label = btn.dataset.label;
        const postsContainer = btn.closest('section').querySelector('.section-posts');
        const allPosts = catMap[label];
        const html = allPosts.slice(MAX).map(e => `<div class="section-post-item" style="animation: fadeIn 0.4s ease forwards"><a href="${e.link.find(lk => lk.rel === 'alternate').href}">${esc(e.title.$t)}</a><span>${e.published.$t.slice(0, 10)}</span></div>`).join('');
        postsContainer.insertAdjacentHTML('beforeend', html);
        btn.remove();
      };
    };
    const cache = localStorage.getItem('blog_posts_cache'), cacheTime = localStorage.getItem('blog_cache_time');
    if (cache && cacheTime && (Date.now() - cacheTime < EXPIRY)) renderHome(JSON.parse(cache));
    else fetch(`/feeds/posts/summary?alt=json&max-results=150`).then(r => r.json()).then(data => {
      const entries = data.feed.entry || [];
      localStorage.setItem('blog_posts_cache', JSON.stringify(entries));
      localStorage.setItem('blog_cache_time', Date.now());
      renderHome(entries);
    });
  }

  // 3. 文章工具
  const post = $('.post-body'), toc = $('#toc-container');
  if (post) {
    const secs = [], go = (el) => el && window.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' });
    Array.from(post.childNodes).forEach(n => { if (!secs.length || n.nodeName === 'H2') secs.push(document.createElement('div')); secs[secs.length - 1].appendChild(n); });
    post.innerHTML = ''; 
    secs.forEach((s, i) => { 
      s.className = 'post-page-section'; s.style.display = 'none'; 
      const nav = document.createElement('div');
      nav.className = 'post-nav';
      nav.innerHTML = `${i > 0 ? `<button onclick="switchPage(${i-1})">上一章</button>` : '<span></span>'}${i < secs.length - 1 ? `<button onclick="switchPage(${i+1})">下一章</button>` : '<span></span>'}`;
      s.appendChild(nav);
      post.appendChild(s); 
    });
    window.switchPage = (i, push = true, h = '') => {
      if (!secs[i]) return;
      secs.forEach((s, idx) => s.style.display = idx === i ? 'block' : 'none');
      if (toc) {
        const h2s = secs.map((s, idx) => `<li><a href="javascript:void(0)" class="${idx === i ? 'active' : ''}" onclick="switchPage(${idx})">${esc(s.querySelector('h2')?.textContent || '引言')}</a></li>`).join('');
        const h3s = $$('h3', secs[i]).map((h3, idx) => { if(!h3.id) h3.id = `h3-${i}-${idx}`; return `<li><a href="#${h3.id}" class="h3-a">${esc(h3.textContent)}</a></li>` }).join('');
        toc.innerHTML = `<div class="toc-h2-section"><p class="toc-title">大綱</p><ul class="toc-list">${h2s}</ul></div>` + (h3s ? `<div class="toc-h3-section"><p class="toc-title">小節</p><ul class="toc-list">${h3s}</ul></div>` : '');
      }
      if (push) history.pushState({p: i}, '', i ? '#section-' + i : '#main');
      setTimeout(() => go(h ? $(h) : (push ? post : null)), 50);
      $('#toc-aside')?.classList.remove('active');
    };
    if (toc) toc.onclick = (e) => { const a = e.target.closest('.h3-a'); if (a) { e.preventDefault(); go($(a.getAttribute('href'))); } };
    window.onpopstate = (e) => switchPage(e.state?.p || 0, false);
    const h = window.location.hash;
    if (h.startsWith('#h3-')) { const p = secs.findIndex(s => s.querySelector(h)); switchPage(p < 0 ? 0 : p, false, h); }
    else switchPage(h.startsWith('#section-') ? parseInt(h.split('-')[1]) : 0, false);
  }

  // 4. 通用 UI
  document.onclick = (e) => {
    [['#menu-aside', '#menu-toggle'], ['#toc-aside', '#toc-toggle']].forEach(([n, b]) => {
      const nav = $(n), btn = $(b);
      if (btn?.contains(e.target)) { e.stopPropagation(); nav.classList.toggle('active'); }
      else if (!nav?.contains(e.target) || e.target.closest('a')) nav?.classList.remove('active');
    });
  };

});
//]]>