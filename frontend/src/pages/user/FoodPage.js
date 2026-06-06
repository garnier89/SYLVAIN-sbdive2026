import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { merchantAPI } from '../../services/api';
import {
  MagnifyingGlass, MapPin, Star, Clock, ArrowLeft, Funnel,
} from '@phosphor-icons/react';

// Verticales de livraison — chaque type filtre les marchands par `store_type`.
// La page est réutilisée par : Repas, Courses, Fleurs, Papeterie, Vin, Matériaux.
const VERTICALS = {
  restaurant: {
    storeType: 'restaurant', title: 'Livraison Repas',
    placeholder: 'Rechercher un restaurant…', emptyTitle: 'Aucun restaurant trouvé',
    fallback: 'https://images.unsplash.com/photo-1632898657999-ae6920976661?w=400',
  },
  grocery: {
    storeType: 'grocery', title: 'Livraison Courses',
    placeholder: 'Rechercher une épicerie…', emptyTitle: 'Aucune épicerie trouvée',
    fallback: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400',
  },
  florist: {
    storeType: 'florist', title: 'Livraison Fleurs',
    placeholder: 'Rechercher un fleuriste…', emptyTitle: 'Aucun fleuriste trouvé',
    fallback: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=400',
  },
  stationery: {
    storeType: 'stationery', title: 'Livraison Papeterie',
    placeholder: 'Rechercher une papeterie…', emptyTitle: 'Aucune papeterie trouvée',
    fallback: 'https://images.unsplash.com/photo-1568205612837-017257d2310a?w=400',
  },
  wine: {
    storeType: 'wine', title: 'Vin & Spiritueux',
    placeholder: 'Rechercher une cave…', emptyTitle: 'Aucune cave trouvée',
    fallback: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400',
  },
  construction: {
    storeType: 'construction', title: 'Matériaux & Construction',
    placeholder: 'Rechercher un magasin…', emptyTitle: 'Aucun magasin trouvé',
    fallback: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=400',
  },
};

const FoodPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const vertical = VERTICALS[params.get('type')] || VERTICALS.restaurant;

  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await merchantAPI.list({ store_type: vertical.storeType });
        if (active) setMerchants(response.data || []);
      } catch (error) {
        console.error('Load merchants error:', error);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [vertical.storeType]);

  const displayMerchants = merchants.filter((m) =>
    m.store_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mobile-container bg-background min-h-screen pb-20" data-testid="store-list-page">
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
              <h1 className="text-xl font-bold" data-testid="store-list-title">{vertical.title}</h1>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin size={14} />
                <span>Livraison à votre position actuelle</span>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <Input
              placeholder={vertical.placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-full"
              data-testid="search-input"
            />
          </div>
        </div>
      </div>

      {/* Store List */}
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
        ) : displayMerchants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="store-list-empty">
            <Funnel size={48} className="text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">{vertical.emptyTitle}</p>
            <p className="text-sm text-muted-foreground/70">Essayez une autre recherche</p>
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
                      src={merchant.image_url || vertical.fallback}
                      alt={merchant.store_name}
                      className="w-full h-full object-cover"
                    />
                    <Badge className="absolute top-3 right-3 bg-white text-foreground">
                      <Clock size={14} className="mr-1" />
                      {merchant.eta_min || 30} min
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
                        Livraison {(merchant.delivery_fee ?? 2.5).toFixed(2).replace('.', ',')} €
                      </Badge>
                      <Badge variant="secondary" className="rounded-full">
                        Ouvert
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
