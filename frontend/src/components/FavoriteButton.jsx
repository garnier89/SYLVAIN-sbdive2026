import React, { useEffect, useState } from 'react';
import { Heart } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { favoritesAPI } from '../services/api';

/**
 * Bouton ❤️ pour sauvegarder une annonce (item_type: 'property' | 'marketplace').
 * Contrôlé : le parent charge favoritesAPI.ids() une fois et passe `favorited`
 * + un `onChange(itemId, favorited)` pour mettre à jour son set local.
 */
export const FavoriteButton = ({ itemType, itemId, favorited = false, onChange, size = 20, className = '' }) => {
  const [fav, setFav] = useState(!!favorited);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setFav(!!favorited); }, [favorited]);

  const toggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const optimistic = !fav;
    setFav(optimistic);
    try {
      const r = await favoritesAPI.toggle(itemType, itemId);
      setFav(r.data.favorited);
      onChange && onChange(itemId, r.data.favorited);
      toast.success(r.data.favorited ? 'Ajouté aux favoris ❤️' : 'Retiré des favoris');
    } catch {
      setFav(!optimistic);
      toast.error('Action impossible');
    } finally { setBusy(false); }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      data-testid={`fav-btn-${itemId}`}
      className={`flex items-center justify-center rounded-full bg-white/90 backdrop-blur shadow-sm w-9 h-9 active:scale-90 transition-transform ${className}`}
    >
      <Heart size={size} weight={fav ? 'fill' : 'regular'} className={fav ? 'text-rose-500' : 'text-gray-500'} />
    </button>
  );
};

export default FavoriteButton;
