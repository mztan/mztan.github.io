/* Shared task-page navigation; existing transport UI guards pending native observations. */
(function (win) {
    'use strict';
    const css = `
/* Considered: Arcade utility footer, cabinet breadcrumb rail, browser-style header.
   Selected: compact Arcade utility navigation. Existing condensed/system type,
   navy/cream/mint and flat edges are reused without changing task geometry. */
#arcade-task-navigation { position:fixed;left:12px;bottom:12px;z-index:1000; }
#arcade-task-navigation a { display:inline-flex;align-items:center;justify-content:center;
    min-height:44px;padding:0 12px;box-sizing:border-box;border:1px solid #1f3550;
    border-radius:2px;background:#142338;color:#f2e8d0;text-decoration:none;
    font:500 14px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif; }
#arcade-task-navigation[data-layout="flow"] { position:static;width:max-content;margin:16px 0 0; }
#arcade-task-navigation[data-layout="compact"] a { width:44px;padding:0;font-size:20px; }
#arcade-task-navigation[data-layout="footer"] { position:absolute;bottom:auto; }
#arcade-task-navigation a:hover { border-color:#4db9a5;color:#4db9a5; }
#arcade-task-navigation a:active { background:#4db9a5;color:#0d1b2a; }
#arcade-task-navigation a:focus-visible { outline:3px solid #4db9a5;outline-offset:3px; }
@media (prefers-reduced-motion:reduce) { #arcade-task-navigation a { transition:none; } }
`;
    function mainPageUrl(scriptUrl, pageUrl) {
        return new URL('index.html', new URL(scriptUrl, pageUrl)).href;
    }
    function overlaps(a, b) {
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }
    function scrollPlacement(pane, fullLink, viewportHeight, scrollY = 0) {
        if (!overlaps(pane, fullLink)) return { layout: 'fixed' };
        const compact = { left: fullLink.left, right: fullLink.left + 44,
            top: fullLink.top, bottom: fullLink.top + 44 };
        if (!overlaps(pane, compact)) return { layout: 'compact' };
        return { layout: 'footer', top: Math.max(viewportHeight, pane.bottom + scrollY) + 16 };
    }
    function placeNavigation(page, nav, link) {
        const doc = page.document;
        nav.removeAttribute('data-layout');
        nav.style.top = '';
        link.textContent = '← Home';
        const pathname = new URL(page.location.href).pathname;
        if (/\/keyboard\/(?:index\.html)?$/.test(pathname) && doc.querySelector && doc.querySelector('.app-wrapper')) {
            nav.setAttribute('data-layout', 'flow');
            return;
        }
        const pane = doc.getElementById('scroll-container');
        if (!pane || !pane.getBoundingClientRect) return;
        const bounds = pane.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const placement = scrollPlacement(bounds, nav.getBoundingClientRect(), page.innerHeight, page.scrollY || 0);
        if (placement.layout === 'fixed') return;
        nav.setAttribute('data-layout', placement.layout);
        if (placement.layout === 'compact') link.textContent = '←';
        if (placement.layout === 'footer') nav.style.top = placement.top + 'px';
    }
    function mount(page, scriptUrl) {
        const doc = page.document;
        if (doc.getElementById('arcade-task-navigation')) return;
        const style = doc.createElement('style');
        style.id = 'arcade-task-navigation-style';
        style.textContent = css;
        doc.head.appendChild(style);
        const nav = doc.createElement('nav');
        nav.id = 'arcade-task-navigation';
        nav.setAttribute('aria-label', 'Page navigation');
        const link = doc.createElement('a');
        link.href = mainPageUrl(scriptUrl, page.location.href);
        link.textContent = '← Home';
        link.title = 'Home';
        link.setAttribute('aria-label', 'Back to Arcade main page');
        nav.appendChild(link);
        doc.body.appendChild(nav);
        const place = () => placeNavigation(page, nav, link);
        place();
        page.addEventListener('resize', place);
        if (page.MutationObserver) {
            for (const id of ['experience-screen', 'scroll-body']) {
                const stage = doc.getElementById(id);
                if (stage) new page.MutationObserver(place).observe(stage, { attributes: true, attributeFilter: ['style'] });
            }
        }
    }
    if (typeof module === 'object' && module.exports) module.exports = { mainPageUrl, mount, scrollPlacement, placeNavigation };
    if (win && win.document) {
        const scriptUrl = win.document.currentScript.src;
        if (win.document.readyState === 'loading') {
            win.document.addEventListener('DOMContentLoaded', () => mount(win, scriptUrl), { once: true });
        } else mount(win, scriptUrl);
    }
})(typeof window === 'undefined' ? null : window);
