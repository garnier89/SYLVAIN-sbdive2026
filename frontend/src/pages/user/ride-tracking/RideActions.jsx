import React from 'react';
import { X, Star, CaretRight, HandHeart, Receipt } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';

/**
 * Bottom-sheet modal listing cancel reasons (one tap = confirm cancellation).
 */
export const CancelRideModal = ({ open, reasons, onCancel, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end" data-testid="cancel-modal">
      <div className="w-full max-w-[430px] mx-auto bg-white rounded-t-3xl p-5 pb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Annuler la course</h3>
          <button onClick={onClose}>
            <X size={24} />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">Choisissez une raison :</p>
        <div className="space-y-2">
          {reasons.map((r) => (
            <button
              key={r.slug}
              className="w-full text-left p-3 rounded-xl border border-gray-200 hover:bg-red-50 hover:border-red-200 transition-colors flex items-center justify-between"
              onClick={() => onCancel(r.reason_fr)}
              data-testid={`cancel-reason-${r.slug}`}
            >
              <span className="text-sm">{r.reason_fr}</span>
              <CaretRight size={16} className="text-gray-400" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Post-ride rating modal with star picker, favorite toggle, tip and waybill quick actions.
 */
export const RatingModal = ({
  open,
  rating,
  setRating,
  markAsFavorite,
  setMarkAsFavorite,
  onSubmit,
  onTip,
  onWaybill,
  onSkip,
}) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
      data-testid="rating-modal"
    >
      <div className="w-[90%] max-w-[380px] bg-white rounded-3xl p-6 text-center">
        <h3 className="text-lg font-bold mb-2">Évaluer votre course</h3>
        <p className="text-sm text-gray-500 mb-4">Comment était votre chauffeur ?</p>
        <div className="flex items-center justify-center gap-2 mb-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)} data-testid={`star-${n}`}>
              <Star
                size={36}
                weight={n <= rating ? 'fill' : 'regular'}
                className={n <= rating ? 'text-yellow-500' : 'text-gray-300'}
              />
            </button>
          ))}
        </div>
        <label
          className="flex items-center justify-center gap-2 mb-5 text-sm cursor-pointer"
          data-testid="mark-favorite-label"
        >
          <input
            type="checkbox"
            checked={markAsFavorite}
            onChange={(e) => setMarkAsFavorite(e.target.checked)}
            className="w-4 h-4 accent-red-500"
            data-testid="mark-favorite-checkbox"
          />
          <span className="text-gray-700">Ajouter ce chauffeur en favori</span>
        </label>
        <Button className="w-full" onClick={onSubmit} data-testid="submit-rating-btn">
          Envoyer ({rating}/5)
        </Button>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            onClick={onTip}
            className="py-2.5 rounded-xl border border-pink-200 bg-pink-50 text-pink-700 text-sm font-semibold flex items-center justify-center gap-1.5"
            data-testid="add-tip-btn"
          >
            <HandHeart size={16} weight="duotone" /> Pourboire
          </button>
          <button
            onClick={onWaybill}
            className="py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold flex items-center justify-center gap-1.5"
            data-testid="view-waybill-btn"
          >
            <Receipt size={16} weight="duotone" /> Feuille de route
          </button>
        </div>

        <button className="text-sm text-gray-400 mt-3" onClick={onSkip}>
          Passer
        </button>
      </div>
    </div>
  );
};
