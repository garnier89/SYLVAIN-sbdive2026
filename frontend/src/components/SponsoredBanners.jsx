import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { promoBannersAPI } from '../services/api';

/**
 * SponsoredBanners — admin-managed sponsored banner carousel shown at the top
 * of the Food (Livraison) and Marketplace home screens. Each card carries a
 * "Sponsorisé" label. Reuses the existing promo-banners CMS (filtered by
 * `surface`). Click target: an internal route or an external URL.
 */
export const SponsoredBanners = ({ surface, accent = '#FF4500' }) => {
  const navigate = useNavigate();
  const [banners, setBanners] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    let alive = true;
    promoBannersAPI.public(undefined, surface)
      .then((r) => {
        if (!alive) return;
        const items = r.data?.items || [];
        setBanners(items);
        // Count one impression per banner per session (dedup via sessionStorage)
        items.forEach((b) => {
          const key = `spb_imp_${surface}_${b.id}`;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1');
            promoBannersAPI.impression(b.id).catch(() => {});
          }
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [surface]);

  // Auto-advance every 4s
  useEffect(() => {
    if (banners.length < 2 || !scrollRef.current) return undefined;
    let i = 0;
    const id = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return;
      i = (i + 1) % banners.length;
      const card = el.children[i];
      if (card) el.scrollTo({ left: card.offsetLeft - 16, behavior: 'smooth' });
    }, 4000);
    return () => clearInterval(id);
  }, [banners.length]);

  if (banners.length === 0) return null;

  const onClick = (b) => {
    promoBannersAPI.click(b.id).catch(() => {});
    const t = (b.target_route || '').trim();
    if (!t) return;
    if (/^https?:\/\//i.test(t)) window.open(t, '_blank', 'noopener');
    else navigate(t);
  };

  return (
    <div className="pt-4" data-testid={`sponsored-banners-${surface}`}>
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory px-4 pb-1">
        {banners.map((b) => {
          const dark = b.theme === 'dark';
          return (
            <button
              key={b.id}
              onClick={() => onClick(b)}
              data-testid={`sponsored-banner-${b.id}`}
              className="relative snap-start shrink-0 w-[86%] rounded-2xl overflow-hidden border border-slate-100 shadow-sm flex items-stretch h-[120px] text-left active:scale-[0.99] transition-transform"
              style={{ background: dark ? (b.bg_color || accent) : '#FFFFFF' }}
            >
              <span
                className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 text-white text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shadow"
                style={{ background: accent }}
                data-testid={`sponsored-label-${b.id}`}
              >
                ★ Sponsorisé
              </span>
              {b.image_url && (
                <div className="w-2/5 bg-cover bg-center shrink-0" style={{ backgroundImage: `url('${b.image_url}')` }} />
              )}
              <div className="flex-1 p-4 pt-6 flex flex-col justify-center min-w-0">
                <p className={`font-bold text-base leading-tight ${dark ? 'text-white' : 'text-[#0B1426]'}`}>{b.title}</p>
                {b.highlight && <p className={`text-2xl font-extrabold mt-0.5 ${dark ? 'text-white' : 'text-[#FF5000]'}`}>{b.highlight}</p>}
                {b.subtitle && <p className={`text-xs mt-1 line-clamp-2 ${dark ? 'text-white/80' : 'text-[#64748B]'}`}>{b.subtitle}</p>}
                {b.cta_label && (
                  <span className={`mt-2 self-start px-3 py-1 text-[11px] font-semibold rounded-lg ${dark ? 'bg-white text-[#0B1426]' : 'bg-[#0B1426] text-white'}`}>{b.cta_label}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SponsoredBanners;
