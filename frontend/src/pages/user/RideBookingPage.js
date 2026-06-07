import React, { useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';

/**
 * Legacy `/ride` booking entry — now a thin redirect to the UNIFIED `/course`
 * flow (RideChoosePage), which correctly separates each order type
 * (instant / pool / scheduled / bidding / rental / …). This removes the old
 * parallel flow that mixed every mode into a single "negotiation" screen.
 *
 * The optional `?type=` query (used by the global search & voice assistant) is
 * mapped to the matching `/course?mode=` and any router `state` (voice prefill)
 * is forwarded untouched.
 */
const TYPE_TO_MODE = {
  pool: 'pool',
  rental: 'rental',
  private: 'buddy_driver',
  buddy: 'buddy_driver',
  bid: 'bidding',
  bidding: 'bidding',
  intercity: 'intercity',
  schedule: 'book_later',
  airport: 'airport',
  pets: 'pets',
  corporate: 'corporate',
  access: 'access',
};

const RideBookingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  useEffect(() => {
    const type = (searchParams.get('type') || '').toLowerCase();
    const mode = TYPE_TO_MODE[type] || 'standard';
    navigate(`/course?mode=${mode}`, { replace: true, state: location.state });
  }, [navigate, searchParams, location.state]);

  return null;
};

export default RideBookingPage;
