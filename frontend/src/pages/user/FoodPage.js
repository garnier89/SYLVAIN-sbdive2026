import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { merchantAPI } from '../../services/api';
import { 
  MagnifyingGlass, MapPin, Star, Clock, 
  ArrowLeft, Funnel, CaretRight
} from '@phosphor-icons/react';

const FoodPage = () => {
  const navigate = useNavigate();
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadMerchants();
  }, []);

  const loadMerchants = async () => {
    try {
      const response = await merchantAPI.list({ store_type: 'restaurant' });
      setMerchants(response.data);
    } catch (error) {
      console.error('Load merchants error:', error);
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { id: 'all', name: 'All' },
    { id: 'fast-food', name: 'Fast Food' },
    { id: 'pizza', name: 'Pizza' },
    { id: 'asian', name: 'Asian' },
    { id: 'healthy', name: 'Healthy' },
  ];

  const filteredMerchants = merchants.filter(m => 
    m.store_name.toLowerCase().includes(search.toLowerCase())
  );

  // Demo merchants if none exist
  const displayMerchants = filteredMerchants.length > 0 ? filteredMerchants : [
    { id: 'demo1', store_name: 'Burger Palace', store_type: 'restaurant', rating: 4.8, address: '123 Main St', image_url: 'https://images.unsplash.com/photo-1632898657999-ae6920976661?w=400' },
    { id: 'demo2', store_name: 'Pizza Heaven', store_type: 'restaurant', rating: 4.5, address: '456 Oak Ave', image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400' },
    { id: 'demo3', store_name: 'Sushi Master', store_type: 'restaurant', rating: 4.9, address: '789 Elm Rd', image_url: 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400' },
  ];

  return (
    <div className="mobile-container bg-background min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-full"
              onClick={() => navigate(-1)}
              data-testid="back-btn"
            >
              <ArrowLeft size={20} />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Food Delivery</h1>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin size={14} />
                <span>Delivering to current location</span>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <Input
              placeholder="Search restaurants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-full"
              data-testid="search-input"
            />
          </div>

          {/* Categories */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {categories.map((cat) => (
              <Button
                key={cat.id}
                variant={filter === cat.id ? 'default' : 'outline'}
                size="sm"
                className={`rounded-full whitespace-nowrap ${filter === cat.id ? 'bg-primary text-white' : ''}`}
                onClick={() => setFilter(cat.id)}
                data-testid={`category-${cat.id}`}
              >
                {cat.name}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Restaurant List */}
      <div className="p-4 space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-0">
                  <div className="h-40 bg-muted rounded-t-lg" />
                  <div className="p-4 space-y-2">
                    <div className="h-5 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {displayMerchants.map((merchant) => (
              <Card 
                key={merchant.id}
                className="overflow-hidden cursor-pointer service-card"
                onClick={() => navigate(`/food/${merchant.id}`)}
                data-testid={`merchant-${merchant.id}`}
              >
                <CardContent className="p-0">
                  <div className="relative h-40">
                    <img
                      src={merchant.image_url || 'https://images.unsplash.com/photo-1632898657999-ae6920976661?w=400'}
                      alt={merchant.store_name}
                      className="w-full h-full object-cover"
                    />
                    <Badge className="absolute top-3 right-3 bg-white text-foreground">
                      <Clock size={14} className="mr-1" />
                      25-35 min
                    </Badge>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{merchant.store_name}</h3>
                        <p className="text-sm text-muted-foreground">{merchant.address}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Star size={16} weight="fill" className="text-amber-500" />
                        <span className="font-medium">{merchant.rating || 4.5}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary" className="rounded-full">
                        $2.50 delivery
                      </Badge>
                      <Badge variant="secondary" className="rounded-full">
                        $15 min
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FoodPage;
