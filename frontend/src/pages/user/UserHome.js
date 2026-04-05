import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { 
  Car, Motorcycle, Package, ForkKnife, 
  House, Briefcase, MapPin, Bell, Wallet,
  User, CaretRight, Star
} from '@phosphor-icons/react';

const UserHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  const services = [
    { id: 'ride', name: 'Ride', icon: Car, color: 'bg-emerald-500', path: '/ride' },
    { id: 'moto', name: 'Moto', icon: Motorcycle, color: 'bg-amber-500', path: '/ride?type=motorcycle' },
    { id: 'food', name: 'Food', icon: ForkKnife, color: 'bg-rose-500', path: '/food' },
    { id: 'parcel', name: 'Parcel', icon: Package, color: 'bg-blue-500', path: '/parcel' },
  ];

  const quickActions = [
    { id: 'home', name: 'Home', icon: House },
    { id: 'work', name: 'Work', icon: Briefcase },
  ];

  return (
    <div className="mobile-container min-h-screen pb-20 bg-white text-gray-900">
      {/* Header */}
      <div className="p-4 pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border-2 border-primary">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {user?.name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm text-muted-foreground">{greeting}</p>
              <h2 className="font-semibold text-lg">{user?.name || 'User'}</h2>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="rounded-full" data-testid="notifications-btn">
              <Bell size={24} weight="duotone" />
            </Button>
          </div>
        </div>

        {/* Search / Where to */}
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow" 
          onClick={() => navigate('/ride')}
          data-testid="where-to-card"
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <MapPin size={20} weight="duotone" className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Where to?</p>
              <p className="text-sm text-muted-foreground">Enter your destination</p>
            </div>
            <CaretRight size={20} className="text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      {/* Services Grid */}
      <div className="px-4 py-2">
        <h3 className="font-semibold mb-3">Services</h3>
        <div className="grid grid-cols-4 gap-3">
          {services.map((service) => (
            <button
              key={service.id}
              onClick={() => navigate(service.path)}
              className="flex flex-col items-center gap-2 service-card"
              data-testid={`service-${service.id}-btn`}
            >
              <div className={`w-14 h-14 rounded-2xl ${service.color} flex items-center justify-center shadow-lg`}>
                <service.icon size={28} weight="duotone" className="text-white" />
              </div>
              <span className="text-sm font-medium">{service.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Saved Places */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Saved Places</h3>
          <Button variant="ghost" size="sm" className="text-primary" data-testid="manage-places-btn">
            Manage
          </Button>
        </div>
        <div className="space-y-2">
          {quickActions.map((action) => (
            <Card 
              key={action.id} 
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              data-testid={`saved-place-${action.id}`}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <action.icon size={20} weight="duotone" className="text-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{action.name}</p>
                  <p className="text-sm text-muted-foreground">Add address</p>
                </div>
                <CaretRight size={20} className="text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Promo Banner */}
      <div className="px-4 py-2">
        <Card className="bg-gradient-to-r from-primary to-emerald-400 text-white overflow-hidden">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">First ride</p>
              <h3 className="text-xl font-bold">50% OFF</h3>
              <p className="text-sm opacity-90">Use code WELCOME</p>
            </div>
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
              <Star size={40} weight="duotone" className="text-white" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Recent Activity</h3>
          <Link to="/history" className="text-primary text-sm font-medium" data-testid="view-history-link">
            View all
          </Link>
        </div>
        <Card>
          <CardContent className="p-4 flex items-center justify-center text-muted-foreground">
            <p className="text-sm">No recent trips</p>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t z-50">
        <div className="max-w-[430px] mx-auto flex items-center justify-around py-3">
          <button className="flex flex-col items-center gap-1 text-primary" data-testid="nav-home">
            <House size={24} weight="duotone" />
            <span className="text-xs font-medium">Home</span>
          </button>
          <button 
            className="flex flex-col items-center gap-1 text-muted-foreground"
            onClick={() => navigate('/history')}
            data-testid="nav-activity"
          >
            <Car size={24} weight="regular" />
            <span className="text-xs">Activity</span>
          </button>
          <button 
            className="flex flex-col items-center gap-1 text-muted-foreground"
            onClick={() => navigate('/wallet')}
            data-testid="nav-wallet"
          >
            <Wallet size={24} weight="regular" />
            <span className="text-xs">Wallet</span>
          </button>
          <button 
            className="flex flex-col items-center gap-1 text-muted-foreground"
            onClick={() => navigate('/profile')}
            data-testid="nav-profile"
          >
            <User size={24} weight="regular" />
            <span className="text-xs">Account</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserHome;
