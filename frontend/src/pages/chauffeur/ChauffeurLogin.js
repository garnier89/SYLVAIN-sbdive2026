import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { SteeringWheel, Envelope, Lock, ArrowRight } from '@phosphor-icons/react';
import { toast } from 'sonner';

const ChauffeurLogin = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(email, password);
      if (data.user.role !== 'driver') {
        toast.error('Ce compte n\'est pas un compte chauffeur. Utilisez SB Drive Client.');
        return;
      }
      navigate('/chauffeur/home');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Identifiants incorrects');
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
            <CardTitle className="text-2xl font-bold text-white">Bienvenue</CardTitle>
            <CardDescription className="text-gray-400">Connectez-vous à SB Drive Chauffeur</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-300">Email</Label>
              <div className="relative">
                <Envelope className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <Input id="email" type="email" placeholder="email@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" required data-testid="chauffeur-login-email" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300">Mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <Input id="password" type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" required data-testid="chauffeur-login-password" />
              </div>
            </div>
            <Button type="submit" className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-base font-semibold" disabled={loading} data-testid="chauffeur-login-submit">
              {loading ? 'Connexion...' : 'Se connecter'} <ArrowRight size={18} className="ml-2" />
            </Button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            Pas encore chauffeur ?{' '}
            <Link to="/chauffeur/register" className="text-amber-500 hover:underline font-medium" data-testid="chauffeur-register-link">
              S'inscrire
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

export default ChauffeurLogin;
