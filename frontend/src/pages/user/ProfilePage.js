import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { 
  User, CaretRight, MapPin, CreditCard, 
  Bell, Shield, Question, SignOut, Star
} from '@phosphor-icons/react';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const menuItems = [
    { icon: MapPin, label: 'Saved Addresses', path: '/addresses' },
    { icon: CreditCard, label: 'Payment Methods', path: '/payments' },
    { icon: Bell, label: 'Notifications', path: '/notifications' },
    { icon: Shield, label: 'Privacy & Security', path: '/privacy' },
    { icon: Question, label: 'Help & Support', path: '/support' },
  ];

  return (
    <div className="mobile-container bg-background min-h-screen pb-20">
      <div className="p-4 space-y-6">
        {/* Profile Header */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 border-4 border-primary">
                <AvatarImage src={user?.avatar_url} />
                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                  {user?.name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="text-xl font-bold">{user?.name}</h2>
                <p className="text-muted-foreground">{user?.email}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Star size={16} weight="fill" className="text-amber-500" />
                  <span className="text-sm">5.0</span>
                </div>
              </div>
            </div>
            <Button 
              variant="outline" 
              className="w-full mt-4 rounded-full"
              onClick={() => navigate('/profile/edit')}
              data-testid="edit-profile-btn"
            >
              Edit Profile
            </Button>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">0</p>
              <p className="text-sm text-muted-foreground">Rides</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">0</p>
              <p className="text-sm text-muted-foreground">Orders</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">$0</p>
              <p className="text-sm text-muted-foreground">Saved</p>
            </CardContent>
          </Card>
        </div>

        {/* Menu */}
        <div className="space-y-2">
          {menuItems.map((item) => (
            <Card 
              key={item.label}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(item.path)}
              data-testid={`menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <item.icon size={20} className="text-foreground" />
                </div>
                <span className="flex-1 font-medium">{item.label}</span>
                <CaretRight size={20} className="text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Logout */}
        <Button
          variant="destructive"
          className="w-full rounded-full"
          onClick={handleLogout}
          data-testid="logout-btn"
        >
          <SignOut size={20} className="mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
};

export default ProfilePage;
