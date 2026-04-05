import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { merchantAPI } from '../../services/api';
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
    loadMerchant();
    // Load cart from localStorage
    const savedCart = localStorage.getItem(`cart_${merchantId}`);
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
  }, [merchantId]);

  useEffect(() => {
    // Save cart to localStorage
    if (merchantId) {
      localStorage.setItem(`cart_${merchantId}`, JSON.stringify(cart));
    }
  }, [cart, merchantId]);

  const loadMerchant = async () => {
    try {
      const merchantRes = await merchantAPI.get(merchantId);
      setMerchant(merchantRes.data);
      const productsRes = await merchantAPI.getProducts(merchantId);
      setProducts(productsRes.data);
    } catch (error) {
      // Demo data
      setMerchant({
        id: merchantId,
        store_name: 'Burger Palace',
        store_type: 'restaurant',
        address: '123 Main Street, NYC',
        rating: 4.8,
        total_orders: 1250,
        opening_hours: '09:00 - 22:00',
        image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800'
      });
      setProducts([
        { id: 'p1', name: 'Classic Burger', description: 'Juicy beef patty with fresh lettuce, tomato, and special sauce', price: 12.99, category: 'Burgers', is_available: true },
        { id: 'p2', name: 'Cheese Burger', description: 'Classic burger topped with melted cheddar cheese', price: 14.99, category: 'Burgers', is_available: true },
        { id: 'p3', name: 'Bacon Burger', description: 'Loaded with crispy bacon strips and BBQ sauce', price: 16.99, category: 'Burgers', is_available: true },
        { id: 'p4', name: 'Veggie Burger', description: 'Plant-based patty with avocado and sprouts', price: 13.99, category: 'Burgers', is_available: true },
        { id: 'p5', name: 'French Fries', description: 'Crispy golden fries with sea salt', price: 4.99, category: 'Sides', is_available: true },
        { id: 'p6', name: 'Onion Rings', description: 'Beer-battered onion rings', price: 5.99, category: 'Sides', is_available: true },
        { id: 'p7', name: 'Coca Cola', description: 'Ice cold refreshment', price: 2.99, category: 'Drinks', is_available: true },
        { id: 'p8', name: 'Milkshake', description: 'Creamy vanilla milkshake', price: 5.99, category: 'Drinks', is_available: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === productId);
      if (existing && existing.quantity > 1) {
        return prev.map(item =>
          item.id === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        );
      }
      return prev.filter(item => item.id !== productId);
    });
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
                <span>({merchant?.total_orders}+ orders)</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock size={16} />
                <span>25-35 min</span>
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
                          <p className="text-lg font-bold text-emerald-600 mt-2">${product.price.toFixed(2)}</p>
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
                              Add
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
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
          <div className="mobile-container">
            <Button
              className="w-full h-14 rounded-full text-white"
              style={{ backgroundColor: '#00C853' }}
              onClick={() => navigate(`/checkout/${merchantId}`)}
              data-testid="view-cart-btn"
            >
              <ShoppingCart size={20} className="mr-2" />
              View Cart · {cartCount} items · ${cartTotal.toFixed(2)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RestaurantDetail;
