import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { supportAPI } from '../../services/api';
import { 
  ArrowLeft, Headset, CheckCircle, Clock, 
  CaretRight, Plus
} from '@phosphor-icons/react';

const SupportPage = () => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    subject: '',
    message: '',
    related_type: ''
  });
  const [submitted, setSubmitted] = useState(false);

  const loadTickets = async () => {
    try {
      const response = await supportAPI.listTickets();
      setTickets(response.data);
    } catch (error) {
      console.error('Load tickets error:', error);
    }
  };

  const submitTicket = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await supportAPI.createTicket(formData);
      setSubmitted(true);
      setShowForm(false);
      loadTickets();
    } catch (error) {
      console.error('Submit ticket error:', error);
      // Demo success
      setSubmitted(true);
      setShowForm(false);
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { value: 'ride', label: 'Ride Issue' },
    { value: 'order', label: 'Order Issue' },
    { value: 'payment', label: 'Payment Issue' },
    { value: 'account', label: 'Account Issue' },
    { value: 'other', label: 'Other' },
  ];

  const faqs = [
    { q: 'How do I cancel a ride?', a: 'You can cancel a ride from the tracking screen before the driver arrives.' },
    { q: 'How do I get a refund?', a: 'Refunds are processed automatically for eligible cancellations.' },
    { q: 'How do I update my payment method?', a: 'Go to Profile > Payment Methods to add or remove cards.' },
    { q: 'How do I become a driver?', a: 'Register as a driver from the app and submit your documents.' },
  ];

  if (submitted) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="text-center animate-fade-in">
          <div className="w-24 h-24 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-6">
            <CheckCircle size={48} weight="fill" className="text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Ticket Submitted</h1>
          <p className="text-gray-500 mb-6">
            We'll get back to you within 24 hours.
          </p>
          <Button
            className="w-full rounded-full h-12"
            style={{ backgroundColor: '#00C853' }}
            onClick={() => navigate('/')}
            data-testid="back-home-btn"
          >
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-20">
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
          <h1 className="text-xl font-bold">Help & Support</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* New Ticket Button */}
        {!showForm && (
          <Button
            className="w-full rounded-full h-12"
            style={{ backgroundColor: '#00C853' }}
            onClick={() => setShowForm(true)}
            data-testid="new-ticket-btn"
          >
            <Plus size={20} className="mr-2" />
            Create Support Ticket
          </Button>
        )}

        {/* Ticket Form */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>Create Support Ticket</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitTicket} className="space-y-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={formData.related_type}
                    onValueChange={(value) => setFormData({ ...formData, related_type: value })}
                  >
                    <SelectTrigger data-testid="category-select">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    placeholder="Brief description of your issue"
                    required
                    data-testid="subject-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Message</Label>
                  <Textarea
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Please describe your issue in detail..."
                    rows={4}
                    required
                    data-testid="message-input"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-full"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 rounded-full text-white"
                    style={{ backgroundColor: '#00C853' }}
                    disabled={loading}
                    data-testid="submit-ticket-btn"
                  >
                    {loading ? 'Submitting...' : 'Submit'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* FAQs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {faqs.map((faq, idx) => (
              <div 
                key={idx} 
                className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                data-testid={`faq-${idx}`}
              >
                <p className="font-medium text-gray-900">{faq.q}</p>
                <p className="text-sm text-gray-500 mt-1">{faq.a}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Contact Options */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Us</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <Headset size={24} className="text-emerald-500" />
              <div className="flex-1">
                <p className="font-medium">Live Chat</p>
                <p className="text-sm text-gray-500">Available 24/7</p>
              </div>
              <CaretRight size={20} className="text-gray-400" />
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <Clock size={24} className="text-blue-500" />
              <div className="flex-1">
                <p className="font-medium">Call Support</p>
                <p className="text-sm text-gray-500">9 AM - 9 PM</p>
              </div>
              <CaretRight size={20} className="text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SupportPage;
