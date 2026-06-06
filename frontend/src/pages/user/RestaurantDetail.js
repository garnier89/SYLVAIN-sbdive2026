import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { merchantAPI, cartAPI } from '../../services/api';
import { 
  ArrowLeft, Star, Clock, MapPin, Plus, Minus,
  ShoppingCart, X
} from '@phosphor-icons/react';

const RestaurantDetail = () => {
  const { merchantId } = useParams();
  const navigate = useNavigate();
  const [merchant, setMerchant] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    const loadMerchant = async () => {
      try {
        const merchantRes = await merchantAPI.get(merchantId);
        setMerchant(merchantRes.data);
        const productsRes = await merchantAPI.getProducts(merchantId);
        setProducts(productsRes.data);
      } catch (error) {
        console.error('Load merchant error:', error);
        navigate('/food');
      } finally {
        setLoading(false);
      }
    };
    loadMerchant();
    // Load cart: try backend first, then localStorage fallback
    const loadCart = async () => {
      try {
        const res = await cartAPI.get();
        if (res.data.merchant_id === merchantId && res.data.items?.length > 0) {
          setCart(res.data.items);
          localStorage.setItem(`cart_${merchantId}`, JSON.stringify(res.data.items));
          return;
        }
      } catch (err) {
        console.error('Failed to load cart from backend:', err);
      }
      const savedCart = localStorage.getItem(`cart_${merchantId}`);
      if (savedCart) {
        try { setCart(JSON.parse(savedCart)); } catch (_err) { console.warn('[RestaurantDetail] parse error', _err); }
      }
    };
    loadCart();
  }, [merchantId, navigate]);

  useEffect(() => {
    // Save cart to localStorage + backend
    if (merchantId) {
      localStorage.setItem(`cart_${merchantId}`, JSON.stringify(cart));
      cartAPI.save(merchantId, cart).catch(() => {});
    }
  }, [cart, merchantId]);

  const addToCart = (product) => {
    const exists = cart.some((item) => item.id === product.id);
    const next = exists
      ? cart.map((item) =>
          (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
      : [...cart, {
          id: product.id,
          name: product.name,
          price: product.price,
          description: product.description,
          category: product.category,
          image_url: product.image_url,
          quantity: 1,
        }];
    setCart(next);
  };

  const removeFromCart = (productId) => {
    const next = cart
      .map((item) =>
        (item.id === productId ? { ...item, quantity: item.quantity - 1 } : item))
      .filter((item) => item.quantity > 0);
    setCart(next);
  };

  const getCartQuantity = (productId) => {
    const item = cart.find(i => i.id === productId);
    return item ? item.quantity : 0;
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const categories = [...new Set(products.map(p => p.category))];

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-white">
        <div className="animate-pulse">
          <div className="h-48 bg-gray-200" />
          <div className="p-4 space-y-4">
            <div className="h-8 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-white pb-24">
      {/* Header Image */}
      <div className="relative h-48">
        <img
          src={merchant?.image_url || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800'}
          alt={merchant?.store_name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 left-4 bg-white/90 rounded-full"
          onClick={() => navigate(-1)}
          data-testid="back-btn"
        >
          <ArrowLeft size={20} />
        </Button>
      </div>

      {/* Restaurant Info */}
      <div className="p-4 -mt-8 relative">
        <Card>
          <CardContent className="p-4">
            <h1 className="text-2xl font-bold text-gray-900">{merchant?.store_name}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <Star size={16} weight="fill" className="text-amber-500" />
                <span className="font-medium text-gray-900">{merchant?.rating}</span>
                <span>({merchant?.total_orders}+ commandes)</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock size={16} />
                <span>{merchant?.eta_min || 30} min</span>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2 text-sm text-gray-500">
              <MapPin size={16} />
              <span>{merchant?.address}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Menu */}
      <div className="p-4 space-y-6">
        {categories.map(category => (
          <div key={category}>
            <h2 className="text-lg font-bold text-gray-900 mb-3">{category}</h2>
            <div className="space-y-3">
              {products
                .filter(p => p.category === category && p.is_available)
                .map(product => {
                  const quantity = getCartQuantity(product.id);
                  return (
                    <Card key={product.id} data-testid={`product-${product.id}`}>
                      <CardContent className="p-4 flex gap-4">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{product.name}</h3>
                          <p className="text-sm text-gray-500 line-clamp-2">{product.description}</p>
                          <p className="text-lg font-bold text-emerald-600 mt-2">{product.price.toFixed(2).replace('.', ',')} €</p>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                          {quantity > 0 ? (
                            <div className="flex items-center gap-2 bg-emerald-50 rounded-full px-2 py-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 rounded-full"
                                onClick={() => removeFromCart(product.id)}
                                data-testid={`remove-${product.id}`}
                              >
                                <Minus size={16} />
                              </Button>
                              <span className="font-bold text-emerald-600 w-6 text-center">{quantity}</span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 rounded-full"
                                onClick={() => addToCart(product)}
                                data-testid={`add-more-${product.id}`}
                              >
                                <Plus size={16} />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                              onClick={() => addToCart(product)}
                              data-testid={`add-${product.id}`}
                            >
                              <Plus size={16} className="mr-1" />
                              Ajouter
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {/* Cart Button */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t z-50">
          <div className="max-w-[430px] mx-auto">
            <Button
              className="w-full h-14 rounded-full text-white"
              style={{ backgroundColor: '#FF4500' }}
              onClick={() => navigate(`/checkout/${merchantId}`)}
              data-testid="view-cart-btn"
            >
              <ShoppingCart size={20} className="mr-2" />
              Voir le panier · {cartCount} article{cartCount > 1 ? 's' : ''} · {cartTotal.toFixed(2).replace('.', ',')} €
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RestaurantDetail;
