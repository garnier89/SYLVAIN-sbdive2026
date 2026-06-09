import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import { merchantAPI } from '../../services/api';
import { useLocale } from '../../contexts/LocaleContext';
import { toast } from 'sonner';
import { Plus, Pencil, Trash, Package, MagnifyingGlass, Warning } from '@phosphor-icons/react';

const emptyForm = { name: '', description: '', price: '', category: '', image_url: '', is_available: true, stock: '' };

const MerchantProducts = () => {
  const { money } = useLocale();
  const [merchantId, setMerchantId] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

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
      });
      await reload();
    } catch (error) {
      toast.error('Échec de la mise à jour');
    }
  };

  const resetForm = () => { setEditingProduct(null); setFormData(emptyForm); };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(search.toLowerCase())
  );

  const categories = ['Boulangerie', 'Épicerie', 'Fruits & Légumes', 'Boissons', 'Plats', 'Desserts', 'Autre'];
  const isOutOfStock = (p) => p.stock !== null && p.stock !== undefined && p.stock <= 0;

  return (
    <div className="p-6 space-y-6" data-testid="merchant-products">
      <div className="flex items-center justify-between">
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
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle>
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
              <div className="space-y-2">
                <Label htmlFor="category">Catégorie</Label>
                <select id="category" value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" data-testid="product-category-select">
                  <option value="">Choisir…</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="image_url">URL de l'image (optionnel)</Label>
                <Input id="image_url" value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  placeholder="https://..." data-testid="product-image-input" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="is_available">Disponible à la commande</Label>
                <Switch id="is_available" checked={formData.is_available}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_available: checked })}
                  data-testid="product-available-switch" />
              </div>
              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Annuler</Button>
                <Button type="submit" style={{ backgroundColor: '#f97316' }} className="flex-1 text-white" data-testid="save-product-btn">
                  {editingProduct ? 'Mettre à jour' : 'Ajouter'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <Input placeholder="Rechercher un produit..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="pl-10" data-testid="search-products-input" />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse"><CardContent className="p-4">
              <div className="h-32 bg-gray-200 rounded-lg mb-4" />
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
            </CardContent></Card>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-gray-500">
          <Package size={48} className="mx-auto mb-4 opacity-50" />
          <p>Aucun produit pour l'instant. Ajoutez votre premier produit !</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
            <Card key={product.id} className={`overflow-hidden ${!product.is_available ? 'opacity-60' : ''}`} data-testid={`product-card-${product.id}`}>
              <div className="h-32 bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center relative">
                {product.image_url
                  ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                  : <Package size={48} className="text-orange-300" />}
                {isOutOfStock(product) && (
                  <span className="absolute top-2 left-2 bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1" data-testid={`out-of-stock-${product.id}`}>
                    <Warning size={12} weight="fill" /> Rupture
                  </span>
                )}
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{product.name}</h3>
                    <p className="text-sm text-gray-500 line-clamp-2">{product.description}</p>
                  </div>
                  {product.category && <Badge variant="secondary" className="ml-2">{product.category}</Badge>}
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                  <span>Stock : {product.stock === null || product.stock === undefined ? 'Illimité' : product.stock}</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xl font-bold text-orange-600" data-testid={`product-price-${product.id}`}>{money(product.price)}</p>
                  <div className="flex items-center gap-2">
                    <Switch checked={product.is_available} onCheckedChange={() => toggleAvailability(product)} data-testid={`toggle-${product.id}`} />
                    <Button size="icon" variant="ghost" onClick={() => handleEdit(product)} data-testid={`edit-${product.id}`}><Pencil size={18} /></Button>
                    <Button size="icon" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(product.id)} data-testid={`delete-${product.id}`}><Trash size={18} /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MerchantProducts;
