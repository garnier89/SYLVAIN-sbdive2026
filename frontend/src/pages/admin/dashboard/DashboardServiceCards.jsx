import React from 'react';
import { Users, Storefront, Taxi, Package, Wrench, ChartLine, CheckCircle } from '@phosphor-icons/react';
import { ServiceMiniCard, BuySellRentCard } from './DashboardCards';

/** V3Cube service & commerce card rows (On-demand, Video, Genie/Runner,
 *  Buy-Sell-Rent, Store deliveries, Ride share). */
const DashboardServiceCards = ({ stats, analytics, navigate }) => (
  <>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <ServiceMiniCard
        title="Services à la demande"
        subtitle="Total Trips / Parcel Deliveries"
        stat1={{ label: 'Total Trips', value: analytics?.completed_rides_count || stats.rides || 0, icon: Taxi, color: '#3B82F6' }}
        stat2={{ label: 'Total Parcel Deliveries', value: stats.orders || 0, icon: Package, color: '#8B5CF6' }}
        tabs={['today', 'total']}
        onView={() => navigate('/admin/rides')}
        testId="on-demand-services-card"
      />
      <ServiceMiniCard
        title="Consultation Vidéo"
        subtitle="Sessions Médicales"
        stat1={{ label: 'Consultations', value: 0, icon: ChartLine, color: '#10B981' }}
        stat2={{ label: 'Terminées', value: 0, icon: CheckCircle, color: '#3B82F6' }}
        tabs={['today', 'total']}
        onView={() => navigate('/admin/video')}
        testId="video-consult-card"
      />
      <ServiceMiniCard
        title="Delivery Genie / Runner"
        subtitle="Coursiers express"
        stat1={{ label: 'Runner', value: 0, icon: Wrench, color: '#F59E0B' }}
        stat2={{ label: 'Genie', value: 0, icon: Package, color: '#EC4899' }}
        tabs={['today', 'total']}
        onView={() => navigate('/admin/runner')}
        testId="genie-runner-card"
      />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <BuySellRentCard onView={() => navigate('/admin/marketplace')} />
      <ServiceMiniCard
        title="Livraisons Boutiques"
        subtitle="No. of orders"
        stat1={{ label: 'Total Orders', value: stats.orders || 0, icon: Storefront, color: '#EF4444' }}
        stat2={{ label: 'Active Stores', value: stats.merchants || 0, icon: Storefront, color: '#10B981' }}
        tabs={['today', 'total']}
        onView={() => navigate('/admin/store-orders')}
        testId="store-deliveries-card"
      />
      <ServiceMiniCard
        title="Covoiturage (Ride Share)"
        subtitle="No. of Rides"
        stat1={{ label: 'En cours', value: analytics?.ride_status?.in_progress || 0, icon: Users, color: '#3B82F6' }}
        stat2={{ label: 'Terminées', value: analytics?.ride_status?.completed || 0, icon: CheckCircle, color: '#10B981' }}
        tabs={['today', 'total']}
        onView={() => navigate('/admin/rideshare')}
        testId="ride-share-card"
      />
    </div>
  </>
);

export default DashboardServiceCards;
