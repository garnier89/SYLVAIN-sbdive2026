import { useLocale } from '../../contexts/LocaleContext';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { merchantAPI, cartAPI } from '../../services/api';
import { toast } from 'sonner';
import { ArrowLeft, Star, Clock, MapPin, Plus, Minus, ShoppingCart, Phone, CaretDown } from '@phosphor-icons/react';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Lundi', tue: 'Mardi', wed: 'Mercredi', thu: 'Jeudi', fri: 'Vendredi', sat: 'Samedi', sun: 'Dimanche' };
const todayKey = () => DAY_KEYS[(new Date().getDay() + 6) % 7];

const fmtDay = (day) => {
  if (!day || day.closed || !(day.slots || []).length) return 'Fermé';
  return day.slots.map((s) => `${s[0]}–${s[1]}`).join(', ');
};

const RestaurantDetail = () => {
  const { money } = useLocale();
  const { merchantId } = useParams();
  const navigate = useNavigate();
  const [merchant, setMerchant] = useState(null);
  const [products, setProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHours, setShowHours] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadReviews = useCallback(async () => {
    try { const r = await merchantAPI.getReviews(merchantId); setReviews(r.data); } catch { /* ignore */ }
  }, [merchantId]);

  useEffect(() => {
    const loadMerchant = async () => {
      try {
        const merchantRes = await merchantAPI.get(merchantId);
        setMerchant(merchantRes.data);
        const productsRes = await merchantAPI.getProducts(merchantId);
        setProducts(productsRes.data);
      } catch (error) {
        navigate('/food');
      } finally {
        setLoading(false);
      }
    };
    loadMerchant();
    loadReviews();
    const loadCart = async () => {
      try {
        const res = await cartAPI.get();
        if (res.data.merchant_id === merchantId && res.data.items?.length > 0) {
          setCart(res.data.items);
          localStorage.setItem(`cart_${merchantId}`, JSON.stringify(res.data.items));
          return;
        }
      } catch (err) { /* ignore */ }
      const savedCart = localStorage.getItem(`cart_${merchantId}`);
      if (savedCart) { try { setCart(JSON.parse(savedCart)); } catch (_e) { /* ignore */ } }
    };
    loadCart();
  }, [merchantId, navigate, loadReviews]);

  useEffect(() => {
    if (merchantId) {
      localStorage.setItem(`cart_${merchantId}`, JSON.stringify(cart));
      cartAPI.save(merchantId, cart).catch(() => {});
    }
  }, [cart, merchantId]);

  const isOutOfStock = (p) => p.stock !== null && p.stock !== undefined && p.stock <= 0;

  const addToCart = (product) => {
    if (isOutOfStock(product)) return;
    const exists = cart.some((item) => item.id === product.id);
    const next = exists
      ? cart.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
      : [...cart, { id: product.id, name: product.name, price: product.price, description: product.description, category: product.category, image_url: product.image_url, quantity: 1 }];
    setCart(next);
  };

  const removeFromCart = (productId) => {
    setCart(cart.map((item) => (item.id === productId ? { ...item, quantity: item.quantity - 1 } : item)).filter((item) => item.quantity > 0));
  };

  const getCartQuantity = (productId) => { const item = cart.find(i => i.id === productId); return item ? item.quantity : 0; };

  const submitReview = async () => {
    if (!myRating) { toast.error('Choisissez une note'); return; }
    setSubmitting(true);
    try {
      await merchantAPI.addReview(merchantId, { rating: myRating, comment: myComment });
      toast.success('Merci pour votre avis !');
      setMyRating(0); setMyComment('');
      await loadReviews();
      const m = await merchantAPI.get(merchantId); setMerchant(m.data);
    } catch (e) {
      toast.error(e?.response?.status === 403 ? 'Seuls les clients ayant commandé peuvent laisser un avis' : "Échec de l'envoi");
    } finally { setSubmitting(false); }
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const categories = [...new Set(products.map(p => p.category))];

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-white">
        <div className="animate-pulse"><div className="h-48 bg-gray-200" /><div className="p-4 space-y-4"><div className="h-8 bg-gray-200 rounded w-3/4" /><div className="h-4 bg-gray-200 rounded w-1/2" /></div></div>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-white pb-24" data-testid="storefront-page">
      {/* Banner */}
      <div className="relative h-48">
        <img src={merchant?.banner_url || merchant?.image_url || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800'}
          alt={merchant?.store_name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <Button variant="ghost" size="icon" className="absolute top-4 left-4 bg-white/90 rounded-full" onClick={() => navigate(-1)} data-testid="back-btn"><ArrowLeft size={20} /></Button>
      </div>

      {/* Store info */}
      <div className="p-4 -mt-8 relative">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {merchant?.image_url && <img src={merchant.image_url} alt="logo" className="w-14 h-14 rounded-xl object-cover border" data-testid="store-logo" />}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900">{merchant?.store_name}</h1>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${merchant?.is_open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`} data-testid="open-status">
                    {merchant?.is_open ? 'Ouvert' : 'Fermé'}
                  </span>
                </div>
                {merchant?.storefront_category && <p className="text-sm text-gray-500">{merchant.storefront_category}{merchant.cuisine ? ` · ${merchant.cuisine}` : ''}</p>}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
              <div className="flex items-center gap-1" data-testid="store-rating">
                <Star size={16} weight="fill" className="text-amber-500" />
                <span className="font-medium text-gray-900">{(merchant?.rating || 5).toFixed(1)}</span>
                <span>({merchant?.review_count || 0} avis)</span>
              </div>
              <div className="flex items-center gap-1"><Clock size={16} /><span>{merchant?.eta_min || 30} min</span></div>
              {merchant?.phone && <a href={`tel:${merchant.phone}`} className="flex items-center gap-1 text-emerald-600" data-testid="store-call"><Phone size={16} /> Appeler</a>}
            </div>
            <div className="flex items-center gap-1 mt-2 text-sm text-gray-500"><MapPin size={16} /><span>{merchant?.address}</span></div>
            {merchant?.description && <p className="text-sm text-gray-600 mt-2">{merchant.description}</p>}

            {/* Hours */}
            <button onClick={() => setShowHours(!showHours)} className="mt-3 w-full flex items-center justify-between text-sm font-medium text-gray-700 border-t pt-3" data-testid="toggle-hours">
              <span>Horaires · aujourd'hui : {fmtDay(merchant?.hours?.[todayKey()])}</span>
              <CaretDown size={16} className={`transition-transform ${showHours ? 'rotate-180' : ''}`} />
            </button>
            {showHours && (
              <div className="mt-2 space-y-1 text-sm" data-testid="hours-list">
                {DAY_KEYS.map((d) => (
                  <div key={d} className={`flex justify-between ${d === todayKey() ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                    <span>{DAY_LABELS[d]}</span><span>{fmtDay(merchant?.hours?.[d])}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gallery */}
        {merchant?.gallery?.length > 0 && (
          <div className="flex gap-2 overflow-x-auto mt-3 pb-1" data-testid="store-gallery">
            {merchant.gallery.map((g, i) => <img key={i} src={g} alt={`galerie ${i}`} className="h-24 w-32 rounded-lg object-cover flex-shrink-0 border" />)}
          </div>
        )}
      </div>

      {/* Menu */}
      <div className="p-4 space-y-6">
        {categories.map(category => (
          <div key={category}>
            <h2 className="text-lg font-bold text-gray-900 mb-3">{category}</h2>
            <div className="space-y-3">
              {products.filter(p => p.category === category && p.is_available).map(product => {
                const quantity = getCartQuantity(product.id);
                const oos = isOutOfStock(product);
                return (
                  <Card key={product.id} data-testid={`product-${product.id}`} className={oos ? 'opacity-60' : ''}>
                    <CardContent className="p-4 flex gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">{product.name}</h3>
                          {oos && <Badge className="bg-red-100 text-red-700" data-testid={`oos-${product.id}`}>Rupture</Badge>}
                        </div>
                        <p className="text-sm text-gray-500 line-clamp-2">{product.description}</p>
                        <p className="text-lg font-bold text-emerald-600 mt-2">{money(product.price)}</p>
                      </div>
                      <div className="flex flex-col items-center justify-center">
                        {oos ? (
                          <span className="text-xs text-red-500 font-medium">Indisponible</span>
                        ) : quantity > 0 ? (
                          <div className="flex items-center gap-2 bg-emerald-50 rounded-full px-2 py-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => removeFromCart(product.id)} data-testid={`remove-${product.id}`}><Minus size={16} /></Button>
                            <span className="font-bold text-emerald-600 w-6 text-center">{quantity}</span>
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => addToCart(product)} data-testid={`add-more-${product.id}`}><Plus size={16} /></Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" className="rounded-full border-emerald-500 text-emerald-600 hover:bg-emerald-50" onClick={() => addToCart(product)} data-testid={`add-${product.id}`}><Plus size={16} className="mr-1" /> Ajouter</Button>
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

      {/* Reviews */}
      <div className="p-4 border-t" data-testid="reviews-section">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Avis clients ({reviews.length})</h2>
        <Card className="mb-4">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Laisser un avis</p>
            <div className="flex gap-1" data-testid="review-stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setMyRating(n)} data-testid={`review-star-${n}`}>
                  <Star size={26} weight={n <= myRating ? 'fill' : 'regular'} className={n <= myRating ? 'text-amber-500' : 'text-gray-300'} />
                </button>
              ))}
            </div>
            <Textarea value={myComment} onChange={(e) => setMyComment(e.target.value)} placeholder="Votre commentaire (optionnel)…" data-testid="review-comment" />
            <Button onClick={submitReview} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="submit-review-btn">
              {submitting ? 'Envoi…' : 'Publier mon avis'}
            </Button>
            <p className="text-xs text-gray-400">Réservé aux clients ayant déjà commandé dans cette boutique.</p>
          </CardContent>
        </Card>
        <div className="space-y-3">
          {reviews.length === 0 && <p className="text-sm text-gray-400">Aucun avis pour l'instant.</p>}
          {reviews.map((rev) => (
            <Card key={rev.id} data-testid={`review-${rev.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{rev.user_name}</span>
                  <div className="flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} weight={n <= rev.rating ? 'fill' : 'regular'} className={n <= rev.rating ? 'text-amber-500' : 'text-gray-300'} />)}</div>
                </div>
                {rev.comment && <p className="text-sm text-gray-600 mt-1">{rev.comment}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Cart button */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t z-50">
          <div className="max-w-[430px] mx-auto">
            <Button className="w-full h-14 rounded-full text-white" style={{ backgroundColor: '#FF4500' }} onClick={() => navigate(`/checkout/${merchantId}`)} data-testid="view-cart-btn">
              <ShoppingCart size={20} className="mr-2" /> Voir le panier · {cartCount} article{cartCount > 1 ? 's' : ''} · {money(cartTotal)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RestaurantDetail;
