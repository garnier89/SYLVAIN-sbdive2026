import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '../../components/ui/dialog';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import { merchantAPI } from '../../services/api';
import { useLocale } from '../../contexts/LocaleContext';
import { toast } from 'sonner';
import { Plus, Pencil, Trash, Package, MagnifyingGlass, Warning, Minus, UploadSimple, Spinner } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;
const emptyForm = { name: '', description: '', price: '', category: '', image_url: '', is_available: true, stock: '', low_stock_threshold: '5' };
const FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'available', label: 'Disponibles' },
  { id: 'low', label: 'Stock faible' },
  { id: 'out', label: 'Ruptures' },
];

const MerchantProducts = () => {
  const { money } = useLocale();
  const [merchantId, setMerchantId] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [stockBusy, setStockBusy] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await merchantAPI.getMine();
        setMerchantId(me.data.id);
        const res = await merchantAPI.getProducts(me.data.id);
        setProducts(res.data);
      } catch (e) {
        toast.error("Impossible de charger votre boutique");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const reload = async () => {
    if (!merchantId) return;
    const res = await merchantAPI.getProducts(merchantId);
    setProducts(res.data);
  };

  const buildPayload = () => ({
    name: formData.name,
    description: formData.description,
    price: parseFloat(formData.price) || 0,
    category: formData.category,
    image_url: formData.image_url || null,
    is_available: formData.is_available,
    stock: formData.stock === '' ? null : Math.max(0, parseInt(formData.stock, 10) || 0),
    low_stock_threshold: formData.low_stock_threshold === '' ? 5 : Math.max(0, parseInt(formData.low_stock_threshold, 10) || 0),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingProduct) await merchantAPI.updateProduct(editingProduct.id, buildPayload());
      else await merchantAPI.addProduct(buildPayload());
      setDialogOpen(false);
      resetForm();
      await reload();
      toast.success(editingProduct ? 'Produit mis à jour' : 'Produit ajouté');
    } catch (error) {
      toast.error("Échec de l'enregistrement");
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await merchantAPI.uploadImage(file);
      const url = res.data.url?.startsWith('http') ? res.data.url : `${API}${res.data.url}`;
      setFormData((f) => ({ ...f, image_url: url }));
      toast.success('Image téléversée');
    } catch (err) {
      toast.error("Échec du téléversement de l'image");
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      price: product.price?.toString() || '',
      category: product.category || '',
      image_url: product.image_url || '',
      is_available: product.is_available,
      stock: product.stock === null || product.stock === undefined ? '' : String(product.stock),
      low_stock_threshold: product.low_stock_threshold === null || product.low_stock_threshold === undefined ? '5' : String(product.low_stock_threshold),
    });
    setDialogOpen(true);
  };

  const handleDelete = async (productId) => {
    if (!window.confirm('Supprimer ce produit ?')) return;
    try {
      await merchantAPI.deleteProduct(productId);
      await reload();
      toast.success('Produit supprimé');
    } catch (error) {
      toast.error('Échec de la suppression');
    }
  };

  const toggleAvailability = async (product) => {
    try {
      await merchantAPI.updateProduct(product.id, {
        name: product.name, description: product.description || '', price: product.price,
        category: product.category, image_url: product.image_url || null,
        is_available: !product.is_available,
        stock: product.stock ?? null,
        low_stock_threshold: product.low_stock_threshold ?? 5,
      });
      await reload();
    } catch (error) {
      toast.error('Échec de la mise à jour');
    }
  };

  // Quick stock adjustment (does not require opening the edit dialog).
  const adjustStock = async (product, delta) => {
    if (product.stock === null || product.stock === undefined) {
      toast.info("Définissez d'abord un stock (Modifier).");
      return;
    }
    setStockBusy(product.id);
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, stock: Math.max(0, (p.stock || 0) + delta) } : p)));
    try {
      const res = await merchantAPI.adjustStock(product.id, { delta });
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, stock: res.data.stock } : p)));
    } catch (error) {
      toast.error('Échec de la mise à jour du stock');
      reload();
    } finally {
      setStockBusy(null);
    }
  };

  const resetForm = () => { setEditingProduct(null); setFormData(emptyForm); };

  const stockState = (p) => {
    if (p.stock === null || p.stock === undefined) return 'unlimited';
    if (p.stock <= 0) return 'out';
    const th = p.low_stock_threshold == null ? 5 : p.low_stock_threshold;
    if (p.stock <= th) return 'low';
    return 'ok';
  };

  const filteredProducts = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.category || '').toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    const st = stockState(p);
    if (filter === 'available') return p.is_available;
    if (filter === 'low') return st === 'low';
    if (filter === 'out') return st === 'out';
    return true;
  });

  const counts = {
    total: products.length,
    available: products.filter((p) => p.is_available).length,
    low: products.filter((p) => stockState(p) === 'low').length,
    out: products.filter((p) => stockState(p) === 'out').length,
  };

  const categories = ['Boulangerie', 'Épicerie', 'Fruits & Légumes', 'Boissons', 'Plats', 'Desserts', 'Autre'];

  const Summary = ({ label, value, cls, testid }) => (
    <Card data-testid={testid}><CardContent className="p-4">
      <p className={`text-2xl font-bold ${cls}`}>{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </CardContent></Card>
  );

  return (
    <div className="p-6 space-y-6" data-testid="merchant-products">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Catalogue produits</h1>
          <p className="text-gray-500">Gérez vos produits, leurs prix et leur stock</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: '#f97316' }} className="text-white" data-testid="add-product-btn">
              <Plus size={20} className="mr-2" /> Ajouter un produit
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle>
              <DialogDescription className="sr-only">Formulaire du produit : nom, prix, stock, catégorie et photo.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom du produit</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Baguette tradition" required data-testid="product-name-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Décrivez votre produit..." data-testid="product-description-input" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Prix (€)</Label>
                  <Input id="price" type="number" step="0.01" value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="1.10" required data-testid="product-price-input" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stock">Stock</Label>
                  <Input id="stock" type="number" min="0" value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="Illimité" data-testid="product-stock-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Catégorie</Label>
                  <select id="category" value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" data-testid="product-category-select">
                    <option value="">Choisir…</option>
                    {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="threshold">Seuil alerte stock</Label>
                  <Input id="threshold" type="number" min="0" value={formData.low_stock_threshold}
                    onChange={(e) => setFormData({ ...formData, low_stock_threshold: e.target.value })}
                    placeholder="5" data-testid="product-threshold-input" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Photo du produit</Label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                    {formData.image_url ? <img src={formData.image_url} alt="" className="w-full h-full object-cover" /> : <Package size={24} className="text-gray-300" />}
                  </div>
                  <label className="flex-1">
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" data-testid="product-image-upload" />
                    <span className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 cursor-pointer hover:bg-gray-50">
                      {uploading ? <Spinner size={16} className="animate-spin" /> : <UploadSimple size={16} />}
                      {uploading ? 'Téléversement…' : 'Téléverser une image'}
                    </span>
                  </label>
                </div>
                <Input value={formData.image_url} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  placeholder="…ou collez une URL d'image" data-testid="product-image-input" className="text-xs" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="is_available">Disponible à la commande</Label>
                <Switch id="is_available" checked={formData.is_available}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_available: checked })}
                  data-testid="product-available-switch" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Annuler</Button>
                <Button type="submit" style={{ backgroundColor: '#f97316' }} className="flex-1 text-white" data-testid="save-product-btn">
                  {editingProduct ? 'Mettre à jour' : 'Ajouter'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stock summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Summary label="Produits" value={counts.total} cls="text-gray-900" testid="summary-total" />
        <Summary label="Disponibles" value={counts.available} cls="text-green-600" testid="summary-available" />
        <Summary label="Stock faible" value={counts.low} cls="text-amber-600" testid="summary-low" />
        <Summary label="Ruptures" value={counts.out} cls="text-red-600" testid="summary-out" />
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1" data-testid="stock-filters">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filter === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              data-testid={`filter-${f.id}`}>
              {f.label}{f.id === 'low' && counts.low > 0 ? ` (${counts.low})` : ''}{f.id === 'out' && counts.out > 0 ? ` (${counts.out})` : ''}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-9" data-testid="search-products-input" />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse"><CardContent className="p-4">
              <div className="h-32 bg-gray-200 rounded-lg mb-4" /><div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
            </CardContent></Card>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-gray-500">
          <Package size={48} className="mx-auto mb-4 opacity-50" />
          <p>{products.length === 0 ? 'Aucun produit pour l\'instant. Ajoutez votre premier produit !' : 'Aucun produit dans ce filtre.'}</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const st = stockState(product);
            return (
              <Card key={product.id} className={`overflow-hidden ${!product.is_available ? 'opacity-60' : ''}`} data-testid={`product-card-${product.id}`}>
                <div className="h-32 bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center relative">
                  {product.image_url
                    ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    : <Package size={48} className="text-orange-300" />}
                  {st === 'out' && (
                    <span className="absolute top-2 left-2 bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1" data-testid={`out-of-stock-${product.id}`}>
                      <Warning size={12} weight="fill" /> Rupture
                    </span>
                  )}
                  {st === 'low' && (
                    <span className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1" data-testid={`low-stock-${product.id}`}>
                      <Warning size={12} weight="fill" /> Stock faible
                    </span>
                  )}
                </div>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{product.name}</h3>
                      <p className="text-sm text-gray-500 line-clamp-2">{product.description}</p>
                    </div>
                    {product.category && <Badge variant="secondary" className="ml-2 shrink-0">{product.category}</Badge>}
                  </div>

                  {/* Quick stock control */}
                  <div className="flex items-center justify-between text-sm mb-3 bg-gray-50 rounded-lg px-2 py-1.5">
                    <span className="text-gray-500">Stock</span>
                    {st === 'unlimited' ? (
                      <span className="font-medium text-gray-700">Illimité</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" disabled={stockBusy === product.id || product.stock <= 0}
                          onClick={() => adjustStock(product, -1)} data-testid={`stock-minus-${product.id}`}><Minus size={13} /></Button>
                        <span className={`w-8 text-center font-bold ${st === 'out' ? 'text-red-600' : st === 'low' ? 'text-amber-600' : 'text-gray-900'}`} data-testid={`stock-value-${product.id}`}>{product.stock}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" disabled={stockBusy === product.id}
                          onClick={() => adjustStock(product, 1)} data-testid={`stock-plus-${product.id}`}><Plus size={13} /></Button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xl font-bold text-orange-600" data-testid={`product-price-${product.id}`}>{money(product.price)}</p>
                    <div className="flex items-center gap-1.5">
                      <Switch checked={product.is_available} onCheckedChange={() => toggleAvailability(product)} data-testid={`toggle-${product.id}`} />
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(product)} data-testid={`edit-${product.id}`}><Pencil size={18} /></Button>
                      <Button size="icon" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(product.id)} data-testid={`delete-${product.id}`}><Trash size={18} /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MerchantProducts;
