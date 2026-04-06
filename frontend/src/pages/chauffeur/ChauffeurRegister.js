import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { SteeringWheel, Envelope, Lock, User, Phone, ArrowRight } from '@phosphor-icons/react';
import { toast } from 'sonner';

const ChauffeurRegister = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    setLoading(true);
    try {
      await register({ ...formData, role: 'driver' });
      toast.success('Compte chauffeur créé !');
      navigate('/chauffeur/home');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de l\'inscription');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-gray-900 border-gray-800">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center">
            <SteeringWheel size={36} weight="duotone" className="text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-white">Devenir chauffeur</CardTitle>
            <CardDescription className="text-gray-400">Rejoignez SB Drive Chauffeur</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Nom complet</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <Input placeholder="Jean Dupont" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" required data-testid="chauffeur-reg-name" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Email</Label>
              <div className="relative">
                <Envelope className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <Input type="email" placeholder="email@exemple.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" required data-testid="chauffeur-reg-email" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Téléphone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <Input placeholder="+33 6 12 34 56 78" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" data-testid="chauffeur-reg-phone" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <Input type="password" placeholder="Min. 6 caractères" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" required data-testid="chauffeur-reg-password" />
              </div>
            </div>
            <Button type="submit" className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-base font-semibold" disabled={loading} data-testid="chauffeur-reg-submit">
              {loading ? 'Création...' : 'Créer mon compte chauffeur'} <ArrowRight size={18} className="ml-2" />
            </Button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            Déjà chauffeur ?{' '}
            <Link to="/chauffeur/login" className="text-amber-500 hover:underline font-medium" data-testid="chauffeur-login-link">
              Se connecter
            </Link>
          </p>
          <p className="text-center text-xs text-gray-600 mt-3">
            <Link to="/" className="hover:text-gray-400">Retour à SB Drive Client</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChauffeurRegister;
