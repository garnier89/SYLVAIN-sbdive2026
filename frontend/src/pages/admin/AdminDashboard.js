import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { adminAPI } from '../../services/api';
import { 
  Users, Car, Storefront, Package, 
  CurrencyDollar, Clock, CheckCircle, Warning
} from '@phosphor-icons/react';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await adminAPI.dashboard();
      setStats(response.data);
    } catch (error) {
      console.error('Dashboard error:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = stats ? [
    { icon: Users, label: 'Total Users', value: stats.total_users, color: 'bg-blue-500' },
    { icon: Car, label: 'Total Drivers', value: stats.total_drivers, color: 'bg-emerald-500' },
    { icon: Car, label: 'Active Drivers', value: stats.active_drivers, color: 'bg-green-500' },
    { icon: Storefront, label: 'Merchants', value: stats.total_merchants, color: 'bg-purple-500' },
    { icon: Package, label: 'Today\'s Rides', value: stats.today_rides, color: 'bg-amber-500' },
    { icon: Package, label: 'Today\'s Orders', value: stats.today_orders, color: 'bg-orange-500' },
    { icon: CurrencyDollar, label: 'Today\'s Revenue', value: `$${stats.today_revenue.toFixed(2)}`, color: 'bg-primary' },
    { icon: Clock, label: 'Pending Drivers', value: stats.pending_drivers, color: 'bg-yellow-500' },
    { icon: Warning, label: 'Open Tickets', value: stats.open_tickets, color: 'bg-red-500' },
  ] : [];

  if (loading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-12 w-12 bg-muted rounded-xl mb-4" />
                <div className="h-8 bg-muted rounded w-1/2 mb-2" />
                <div className="h-4 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your platform</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow" data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center`}>
                  <stat.icon size={24} className="text-white" weight="duotone" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock size={20} className="text-amber-500" />
              Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.pending_drivers > 0 ? (
              <p className="text-muted-foreground">
                You have <span className="font-bold text-foreground">{stats.pending_drivers}</span> driver applications pending review.
              </p>
            ) : (
              <p className="text-muted-foreground">No pending approvals</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Warning size={20} className="text-red-500" />
              Support Tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.open_tickets > 0 ? (
              <p className="text-muted-foreground">
                You have <span className="font-bold text-foreground">{stats.open_tickets}</span> open support tickets.
              </p>
            ) : (
              <p className="text-muted-foreground">No open tickets</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
