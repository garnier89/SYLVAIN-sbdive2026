import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

/** Listens for 402 responses (premium-gated) and routes the user to the Pro offer. */
const ProGateListener = () => {
  const navigate = useNavigate();
  useEffect(() => {
    let last = 0;
    const handler = (e) => {
      const now = Date.now();
      if (now - last < 1500) return; // de-dupe bursts
      last = now;
      toast(e.detail || 'Fonctionnalité réservée à SB Tracking Pro', {
        description: 'Passez à Pro pour débloquer cette fonction.',
        action: { label: 'Voir Pro', onClick: () => navigate('/sb-tracking/pro') },
      });
    };
    window.addEventListener('pro-required', handler);
    return () => window.removeEventListener('pro-required', handler);
  }, [navigate]);
  return null;
};

export default ProGateListener;
