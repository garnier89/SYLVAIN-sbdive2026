import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import { merchantAPI } from '../../services/api';
import { 
  Plus, Pencil, Trash, Package, MagnifyingGlass
} from '@phosphor-icons/react';

const MerchantProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    image_url: '',
    is_available: true
  });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      // For now, we'll use a demo merchant ID
      // In production, this would come from the logged-in merchant's profile
      const response = await merchantAPI.getProducts('demo_merchant');
      setProducts(response.data);
    } catch (error) {
      // If no products, use demo data
      setProducts([
        { id: 'prod_1', name: 'Classic Burger', description: 'Juicy beef patty with fresh vegetables', price: 12.99, category: 'Burgers', is_available: true },
        { id: 'prod_2', name: 'Cheese Pizza', description: 'Mozzarella cheese on tomato base', price: 14.99, category: 'Pizza', is_available: true },
        { id: 'prod_3', name: 'Caesar Salad', description: 'Fresh romaine with caesar dressing', price: 9.99, category: 'Salads', is_available: false },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await merchantAPI.updateProduct(editingProduct.id, formData);
      } else {
        await merchantAPI.addProduct(formData);
      }
      setDialogOpen(false);
      resetForm();
      loadProducts();
    } catch (error) {
      console.error('Save product error:', error);
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description,
      price: product.price.toString(),
      category: product.category,
      image_url: product.image_url || '',
      is_available: product.is_available
    });
    setDialogOpen(true);
  };

  const handleDelete = async (productId) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await merchantAPI.deleteProduct(productId);
        loadProducts();
      } catch (error) {
        console.error('Delete product error:', error);
      }
    }
  };

  const toggleAvailability = async (product) => {
    try {
      await merchantAPI.updateProduct(product.id, {
        ...product,
        is_available: !product.is_available
      });
      loadProducts();
    } catch (error) {
      // Update locally for demo
      setProducts(products.map(p => 
        p.id === product.id ? { ...p, is_available: !p.is_available } : p
      ));
    }
  };

  const resetForm = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      description: '',
      price: '',
      category: '',
      image_url: '',
      is_available: true
    });
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const categories = ['Burgers', 'Pizza', 'Salads', 'Drinks', 'Desserts', 'Sides'];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Products</h1>
          <p className="text-gray-500">Manage your store's menu items</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: '#f97316' }} className="text-white" data-testid="add-product-btn">
              <Plus size={20} className="mr-2" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Classic Burger"
                  required
                  data-testid="product-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe your product..."
                  data-testid="product-description-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Price ($)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="9.99"
                    required
                    data-testid="product-price-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger data-testid="product-category-select">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="image_url">Image URL (optional)</Label>
                <Input
                  id="image_url"
                  value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  placeholder="https://..."
                  data-testid="product-image-input"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="is_available">Available for order</Label>
                <Switch
                  id="is_available"
                  checked={formData.is_available}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_available: checked })}
                  data-testid="product-available-switch"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" style={{ backgroundColor: '#f97316' }} className="flex-1 text-white" data-testid="save-product-btn">
                  {editingProduct ? 'Update' : 'Add'} Product
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
          data-testid="search-products-input"
        />
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-32 bg-gray-200 rounded-lg mb-4" />
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-gray-500">
            <Package size={48} className="mx-auto mb-4 opacity-50" />
            <p>No products found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
            <Card key={product.id} className={`overflow-hidden ${!product.is_available ? 'opacity-60' : ''}`} data-testid={`product-card-${product.id}`}>
              <div className="h-32 bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <Package size={48} className="text-orange-300" />
                )}
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{product.name}</h3>
                    <p className="text-sm text-gray-500 line-clamp-2">{product.description}</p>
                  </div>
                  <Badge variant="secondary" className="ml-2">{product.category}</Badge>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xl font-bold text-orange-600">${product.price.toFixed(2)}</p>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={product.is_available}
                      onCheckedChange={() => toggleAvailability(product)}
                      data-testid={`toggle-${product.id}`}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEdit(product)}
                      data-testid={`edit-${product.id}`}
                    >
                      <Pencil size={18} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDelete(product.id)}
                      data-testid={`delete-${product.id}`}
                    >
                      <Trash size={18} />
                    </Button>
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
