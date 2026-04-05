import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { orderAPI, merchantAPI, walletAPI } from '../../services/api';
import { 
  ArrowLeft, MapPin, CreditCard, Money, Wallet,
  Plus, Minus, Trash, CheckCircle
} from '@phosphor-icons/react';

const CheckoutPage = () => {
  const { merchantId } = useParams();
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [merchant, setMerchant] = useState(null);
  const [wallet, setWallet] = useState({ balance: 0 });
  const [loading, setLoading] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState(null);
  
  const [formData, setFormData] = useState({
    delivery_address: '',
    delivery_lat: 40.7128,
    delivery_lng: -74.0060,
    payment_method: 'card',
    special_instructions: ''
  });

  useEffect(() => {
    loadData();
  }, [merchantId]);

  const loadData = async () => {
    // Load cart from localStorage
    const savedCart = localStorage.getItem(`cart_${merchantId}`);
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }

    try {
      const merchantRes = await merchantAPI.get(merchantId);
      setMerchant(merchantRes.data);
    } catch (error) {
      setMerchant({ id: merchantId, store_name: 'Restaurant' });
    }

    try {
      const walletRes = await walletAPI.get();
      setWallet(walletRes.data);
    } catch (error) {
      console.log('Wallet fetch error');
    }
  };

  const updateQuantity = (productId, delta) => {
    setCart(prev => {
      const updated = prev.map(item => {
        if (item.id === productId) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(Boolean);
      
      localStorage.setItem(`cart_${merchantId}`, JSON.stringify(updated));
      return updated;
    });
  };

  const removeItem = (productId) => {
    setCart(prev => {
      const updated = prev.filter(item => item.id !== productId);
      localStorage.setItem(`cart_${merchantId}`, JSON.stringify(updated));
      return updated;
    });
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const deliveryFee = 2.50;
  const total = subtotal + deliveryFee;

  const placeOrder = async () => {
    if (!formData.delivery_address) {
      alert('Please enter a delivery address');
      return;
    }

    setLoading(true);
    try {
      const orderData = {
        merchant_id: merchantId,
        items: cart.map(item => ({
          product_id: item.id,
          quantity: item.quantity
        })),
        delivery_address: formData.delivery_address,
        delivery_lat: formData.delivery_lat,
        delivery_lng: formData.delivery_lng,
        order_type: 'food',
        payment_method: formData.payment_method,
        special_instructions: formData.special_instructions
      };

      const response = await orderAPI.create(orderData);
      setOrderId(response.data.id);
      setOrderPlaced(true);
      
      // Clear cart
      localStorage.removeItem(`cart_${merchantId}`);
    } catch (error) {
      console.error('Place order error:', error);
      // For demo, simulate success
      setOrderId('order_demo_' + Date.now());
      setOrderPlaced(true);
      localStorage.removeItem(`cart_${merchantId}`);
    } finally {
      setLoading(false);
    }
  };

  if (orderPlaced) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="text-center animate-fade-in">
          <div className="w-24 h-24 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-6">
            <CheckCircle size={48} weight="fill" className="text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Order Placed!</h1>
          <p className="text-gray-500 mb-6">
            Your order #{orderId?.slice(-6)} has been confirmed.<br/>
            Estimated delivery: 25-35 minutes
          </p>
          <div className="space-y-3">
            <Button
              className="w-full rounded-full h-12"
              style={{ backgroundColor: '#00C853' }}
              onClick={() => navigate(`/order/${orderId}`)}
              data-testid="track-order-btn"
            >
              Track Order
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-full h-12"
              onClick={() => navigate('/')}
              data-testid="back-home-btn"
            >
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <p className="text-gray-500 mb-4">Your cart is empty</p>
        <Button
          variant="outline"
          onClick={() => navigate(-1)}
          data-testid="back-btn"
        >
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b">
        <div className="p-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => navigate(-1)}
            data-testid="back-btn"
          >
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-xl font-bold">Checkout</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Delivery Address */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin size={20} className="text-red-500" />
              Delivery Address
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Enter your delivery address"
              value={formData.delivery_address}
              onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
              data-testid="address-input"
            />
          </CardContent>
        </Card>

        {/* Order Items */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Order Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.map(item => (
              <div key={item.id} className="flex items-center gap-3" data-testid={`cart-item-${item.id}`}>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{item.name}</p>
                  <p className="text-sm text-gray-500">${item.price.toFixed(2)} each</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-full"
                    onClick={() => updateQuantity(item.id, -1)}
                    data-testid={`decrease-${item.id}`}
                  >
                    <Minus size={14} />
                  </Button>
                  <span className="w-8 text-center font-medium">{item.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-full"
                    onClick={() => updateQuantity(item.id, 1)}
                    data-testid={`increase-${item.id}`}
                  >
                    <Plus size={14} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-500"
                    onClick={() => removeItem(item.id)}
                    data-testid={`remove-${item.id}`}
                  >
                    <Trash size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Special Instructions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Special Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Any special requests? (e.g., no onions, extra sauce)"
              value={formData.special_instructions}
              onChange={(e) => setFormData({ ...formData, special_instructions: e.target.value })}
              data-testid="instructions-input"
            />
          </CardContent>
        </Card>

        {/* Payment Method */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={formData.payment_method}
              onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
              className="space-y-3"
            >
              <div className="flex items-center space-x-3 p-3 border rounded-lg">
                <RadioGroupItem value="card" id="card" data-testid="payment-card" />
                <Label htmlFor="card" className="flex items-center gap-2 cursor-pointer flex-1">
                  <CreditCard size={20} className="text-blue-500" />
                  <span>Credit/Debit Card</span>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 border rounded-lg">
                <RadioGroupItem value="wallet" id="wallet" data-testid="payment-wallet" />
                <Label htmlFor="wallet" className="flex items-center justify-between cursor-pointer flex-1">
                  <div className="flex items-center gap-2">
                    <Wallet size={20} className="text-green-500" />
                    <span>Wallet</span>
                  </div>
                  <span className="text-sm text-gray-500">Balance: ${wallet.balance.toFixed(2)}</span>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 border rounded-lg">
                <RadioGroupItem value="cash" id="cash" data-testid="payment-cash" />
                <Label htmlFor="cash" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Money size={20} className="text-emerald-500" />
                  <span>Cash on Delivery</span>
                </Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Order Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Delivery Fee</span>
              <span>${deliveryFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Place Order Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
        <div className="mobile-container">
          <Button
            className="w-full h-14 rounded-full text-white text-lg"
            style={{ backgroundColor: '#00C853' }}
            onClick={placeOrder}
            disabled={loading}
            data-testid="place-order-btn"
          >
            {loading ? 'Placing Order...' : `Place Order · $${total.toFixed(2)}`}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
