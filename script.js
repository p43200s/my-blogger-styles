// ver 1.05 效能優化 - 分段渲染與 API 請求減量
document.addEventListener('DOMContentLoaded', () => {
  // 設定：將 max-results 調降至 50 以減輕負擔，快取時間設為 1 小時
  const SEP = '-', MAX = 5, EXPIRY = 3600000; 
  const API_URL = `/feeds/posts/summary?alt=json&max-results=50`; 
  
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  const post = $('.post-body');
  const toc = $('#toc-container');

  // --- 選單功能 ---
  const menuWrap = $('#Label1');
  if (menuWrap) {
    const tree = {};
    let openMenus = JSON.parse(sessionStorage.getItem('open-labels') || '[]');
    $$('ul li a', menuWrap).forEach(a => {
      const parts = a.textContent.trim().split(SEP).map(p => p.trim());
      const p = parts[0], c = parts[1];
      if (!tree[p]) tree[p] = { url: `/search/label/${encodeURIComponent(p)}`, kids: {} };
      if (c) tree[p].kids[c] = a.href;
    });
    const html = `<ul>${Object.keys(tree).map(p => {
      const ks = Object.keys(tree[p].kids), has = ks.length > 0;
      const isOpen = openMenus.includes(p) ? 'is-open' : '';
      return `<li class="${isOpen}"><div class="menu-item-row">${has ? `<span class="toggle-btn"></span>` : ''}<a href="${tree[p].url}">${esc(p)}</a></div>${has ? `<ul class="submenu-content">${Object.keys(tree[p].kids).map(k => `<li><span></span><a href="${tree[p].kids[k]}">${esc(k)}</a></li>`).join('')}</ul>` : ''}</li>`;
    }).join('')}</ul>`;
    menuWrap.innerHTML = html;
    menuWrap.onclick = (e) => {
      const btn = e.target.closest('.toggle-btn');
      if (!btn) return;
      const li = btn.closest('li');
      const labelName = li.querySelector('a').textContent;
      const isOpen = li.classList.toggle('is-open');
      openMenus = isOpen ? [...new Set([...openMenus, labelName])] : openMenus.filter(n => n !== labelName);
      sessionStorage.setItem('open-labels', JSON.stringify(openMenus));
    };
  }

  // --- 目錄更新 ---
  const updateTOC = (sections, currentIndex) => { 
    if (!toc) return;
    const h2s = sections.map((s, idx) => {
      const title = s.querySelector('h2')?.textContent || '引言';
      return `<li><a href="javascript:void(0)" class="${idx === currentIndex ? 'active' : ''}" onclick="switchPage(${idx})">${esc(title)}</a></li>`;
    }).join('');
    const h3s = $$('h3', sections[currentIndex]).map((h3, idx) => {
      if (!h3.id) h3.id = `h3-${currentIndex}-${idx}`;
      return `<li><a href="#${h3.id}" class="h3-a">${esc(h3.textContent)}</a></li>`;
    }).join('');
    toc.innerHTML = `<div class="toc-h2-section"><p class="toc-title">大綱</p><ul class="toc-list">${h2s}</ul></div>${h3s ? `<div class="toc-h3-section"><p class="toc-title">小節</p><ul class="toc-list">${h3s}</ul></div>` : ''}`;
  };

  // --- 自動標籤 ---
  const autoLabels = (container) => { 
    if (!container) return;
    $$('div.tcard table', container).forEach(table => {
      const headers = $$('thead th', table).map(el => el.textContent.trim());
      $$('tbody tr', table).forEach(tr => {
        $$('td', tr).forEach((td, i) => {
          if (headers[i] && !td.hasAttribute('data-label')) td.setAttribute('data-label', headers[i]);
        });
      });
    });
    $$('pre', container).forEach(pre => { if (!pre.hasAttribute('data-label')) pre.setAttribute('data-label', 'TERMINAL'); });
  };

  // --- 文章分頁 ---
  if (post) {
    autoLabels(post);
    const sections = [];
    let currentDiv = null;
    Array.from(post.childNodes).forEach(node => {
      if (!currentDiv || node.nodeName === 'H2') {
        currentDiv = document.createElement('div');
        currentDiv.className = 'post-page-section';
        currentDiv.style.display = 'none';
        sections.push(currentDiv);
      }
      currentDiv.appendChild(node);
    });
    post.innerHTML = '';
    sections.forEach((sec, i) => {
      const nav = document.createElement('div');
      nav.className = 'post-nav';
      nav.innerHTML = `${i > 0 ? `<button onclick="switchPage(${i-1})">上一章</button>` : '<span></span>'}${i < sections.length - 1 ? `<button onclick="switchPage(${i+1})">下一章</button>` : '<span></span>'}`;
      sec.appendChild(nav);
      post.appendChild(sec);
    });
    window.switchPage = (index, pushState = true, hash = '') => {
      if (!sections[index]) return;
      sections.forEach((s, idx) => s.style.display = idx === index ? 'block' : 'none');
      updateTOC(sections, index);
      if (pushState) history.pushState({ p: index }, '', index ? `#section-${index}` : '#main');
      requestAnimationFrame(() => {
        const el = hash ? $(hash) : (pushState ? post : null);
        if (el) window.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' });
      });
      $('#toc-aside')?.classList.remove('active');
    };
    if (toc) toc.onclick = (e) => {
      const a = e.target.closest('.h3-a');
      if (a) { e.preventDefault(); const el = $(a.getAttribute('href')); if (el) window.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' }); }
    };
    window.onpopstate = (e) => switchPage(e.state?.p || 0, false);
    const h = window.location.hash;
    if (h.startsWith('#h3-')) {
      const idx = sections.findIndex(s => s.querySelector(h));
      switchPage(idx < 0 ? 0 : idx, false, h);
    } else {
      switchPage(parseInt(h.split('-')[1]) || 0, false);
    }
  }

  // --- 首頁分類渲染 (優化：分段渲染) ---
  const home = $('#home-sections');
  if (home) {
    const renderHome = (entries) => {
      const catMap = {}, path = window.location.pathname;
      const curL = path.includes('/search/label/') ? decodeURIComponent(path.split('/label/')[1].split(/[?#]/)[0]) : null;
      entries.forEach(e => e.category?.forEach(c => (catMap[c.term] = catMap[c.term] || []).push(e)));
      const allK = Object.keys(catMap);
      const targets = curL ? [curL, ...allK.filter(k => k.startsWith(curL + SEP))] : allK.filter(k => k.includes(SEP));
      
      home.innerHTML = '<div class="sections-wrapper"></div>';
      const wrapper = home.querySelector('.sections-wrapper');
      let i = 0;

      // 分段渲染，每次處理 3 個分類，避免阻塞 UI
      const renderChunk = () => {
        const chunk = targets.slice(i, i + 3);
        if (chunk.length === 0) return;
        const html = chunk.map(l => {
          const ps = catMap[l] || [], hasSub = allK.some(k => k.startsWith(l + SEP));
          if (!ps.length || (curL && l === curL && hasSub)) return (curL && l === curL && hasSub) ? `<h1 class="parent-label-title">${esc(l)}</h1>` : '';
          const isCol = !curL && ps.length > MAX;
          return `<section class="home-label-section">
            <h2 class="section-title">${esc(l.split(SEP).pop())}</h2>
            <div class="section-posts">${ps.slice(0, isCol ? MAX : 150).map(e => `<div class="section-post-item"><a href="${e.link.find(lk => lk.rel === 'alternate').href}">${esc(e.title.$t)}</a><span>${e.published.$t.slice(0, 10)}</span></div>`).join('')}</div>
            ${isCol ? `<div class="section-footer"><button class="more-link-btn" data-label="${esc(l)}">顯示更多（${ps.length - MAX}）</button></div>` : ''}
          </section>`;
        }).join('');
        wrapper.insertAdjacentHTML('beforeend', html);
        i += 3;
        requestAnimationFrame(renderChunk);
      };
      renderChunk();

      home.onclick = (e) => {
        const btn = e.target.closest('.more-link-btn');
        if (!btn) return;
        const label = btn.dataset.label;
        const html = catMap[label].slice(MAX).map(e => `<div class="section-post-item"><a href="${e.link.find(lk => lk.rel === 'alternate').href}">${esc(e.title.$t)}</a><span>${e.published.$t.slice(0, 10)}</span></div>`).join('');
        btn.closest('section').querySelector('.section-posts').insertAdjacentHTML('beforeend', html);
        btn.remove();
      };
    };

    const cache = localStorage.getItem('blog_posts_cache'), cTime = localStorage.getItem('blog_cache_time');
    if (cache && cTime && (Date.now() - cTime < EXPIRY)) renderHome(JSON.parse(cache));
    else fetch(API_URL).then(r => r.json()).then(data => {
      const e = data.feed.entry || [];
      localStorage.setItem('blog_posts_cache', JSON.stringify(e));
      localStorage.setItem('blog_cache_time', Date.now());
      renderHome(e);
    }).catch(() => { const old = localStorage.getItem('blog_posts_cache'); if(old) renderHome(JSON.parse(old)); });
  }

  // --- 複製與 UI 控制 ---
  $$('pre').forEach(block => {
    const btn = document.createElement('button');
    btn.className = 'copy-btn'; btn.innerText = 'COPY';
    btn.onclick = () => {
      const t = block.querySelector('code')?.innerText || block.innerText.replace('COPY', '').replace('TERMINAL', '').trim();
      navigator.clipboard.writeText(t).then(() => { btn.innerText = 'DONE!'; setTimeout(() => btn.innerText = 'COPY', 1000); });
    };
    block.prepend(btn);
  });
  
  const fBtn = $('#flicker-toggle');
  if (fBtn) {
    if (localStorage.getItem('flicker-off') === 'true') document.body.classList.add('no-flicker');
    fBtn.onclick = () => localStorage.setItem('flicker-off', document.body.classList.toggle('no-flicker'));
  }

  document.onclick = (e) => {
    [['#menu-aside', '#menu-toggle'], ['#toc-aside', '#toc-toggle']].forEach(([n, b]) => {
      const nav = $(n), btn = $(b);
      if (btn?.contains(e.target)) { e.stopPropagation(); nav.classList.toggle('active'); }
      else if (!nav?.contains(e.target) || e.target.closest('a')) nav?.classList.remove('active');
    });
  };
});