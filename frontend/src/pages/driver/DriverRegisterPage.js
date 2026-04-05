import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { driverAPI } from '../../services/api';
import { Car, Motorcycle, Bicycle, ArrowRight, Upload, CheckCircle } from '@phosphor-icons/react';

const DriverRegisterPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    vehicle_type: '',
    vehicle_number: '',
    vehicle_model: '',
    license_number: '',
  });
  const [documents, setDocuments] = useState({
    license: null,
    registration: null,
    insurance: null,
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Register driver
      await driverAPI.register(formData);
      
      // Upload documents
      for (const [docType, file] of Object.entries(documents)) {
        if (file) {
          await driverAPI.uploadDocument(file, docType);
        }
      }
      
      setStep(3); // Success
    } catch (error) {
      console.error('Registration error:', error);
    } finally {
      setLoading(false);
    }
  };

  const vehicleTypes = [
    { value: 'car', label: 'Car', icon: Car },
    { value: 'motorcycle', label: 'Motorcycle', icon: Motorcycle },
    { value: 'bicycle', label: 'Bicycle', icon: Bicycle },
  ];

  if (step === 3) {
    return (
      <div className="mobile-container min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md text-center animate-slide-up">
          <CardContent className="p-8 space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle size={48} weight="duotone" className="text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Application Submitted!</h2>
              <p className="text-muted-foreground mt-2">
                Your driver application is under review. We'll notify you once it's approved.
              </p>
            </div>
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white rounded-full h-12"
              onClick={() => navigate('/driver')}
              data-testid="go-to-dashboard-btn"
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen p-4 bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-md mx-auto mt-8 animate-slide-up">
        <CardHeader>
          <CardTitle className="text-2xl">Become a Driver</CardTitle>
          <CardDescription>
            Step {step} of 2 - {step === 1 ? 'Vehicle Information' : 'Document Upload'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label>Vehicle Type</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {vehicleTypes.map((v) => (
                      <button
                        key={v.value}
                        type="button"
                        className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                          formData.vehicle_type === v.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-muted-foreground'
                        }`}
                        onClick={() => setFormData({ ...formData, vehicle_type: v.value })}
                        data-testid={`vehicle-type-${v.value}`}
                      >
                        <v.icon 
                          size={32} 
                          weight="duotone" 
                          className={formData.vehicle_type === v.value ? 'text-primary' : 'text-muted-foreground'} 
                        />
                        <span className="text-sm font-medium">{v.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vehicle_number">Vehicle Number</Label>
                  <Input
                    id="vehicle_number"
                    name="vehicle_number"
                    placeholder="ABC 1234"
                    value={formData.vehicle_number}
                    onChange={handleChange}
                    required
                    data-testid="vehicle-number-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vehicle_model">Vehicle Model</Label>
                  <Input
                    id="vehicle_model"
                    name="vehicle_model"
                    placeholder="Toyota Camry 2022"
                    value={formData.vehicle_model}
                    onChange={handleChange}
                    required
                    data-testid="vehicle-model-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="license_number">Driver's License Number</Label>
                  <Input
                    id="license_number"
                    name="license_number"
                    placeholder="DL12345678"
                    value={formData.license_number}
                    onChange={handleChange}
                    required
                    data-testid="license-number-input"
                  />
                </div>

                <Button
                  type="button"
                  className="w-full bg-primary hover:bg-primary/90 text-white rounded-full h-12"
                  disabled={!formData.vehicle_type || !formData.vehicle_number || !formData.vehicle_model || !formData.license_number}
                  onClick={() => setStep(2)}
                  data-testid="next-step-btn"
                >
                  Continue
                  <ArrowRight size={20} className="ml-2" />
                </Button>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-4">
                  {[
                    { key: 'license', label: "Driver's License" },
                    { key: 'registration', label: 'Vehicle Registration' },
                    { key: 'insurance', label: 'Insurance Document' },
                  ].map((doc) => (
                    <div key={doc.key} className="space-y-2">
                      <Label>{doc.label}</Label>
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => setDocuments({ ...documents, [doc.key]: e.target.files[0] })}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          data-testid={`upload-${doc.key}`}
                        />
                        <div className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
                          documents[doc.key] ? 'border-primary bg-primary/5' : 'border-border'
                        }`}>
                          {documents[doc.key] ? (
                            <div className="flex items-center justify-center gap-2 text-primary">
                              <CheckCircle size={20} weight="fill" />
                              <span className="font-medium">{documents[doc.key].name}</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Upload size={24} />
                              <span className="text-sm">Click to upload</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-full h-12"
                    onClick={() => setStep(1)}
                    data-testid="back-btn"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-primary hover:bg-primary/90 text-white rounded-full h-12"
                    disabled={loading}
                    data-testid="submit-btn"
                  >
                    {loading ? 'Submitting...' : 'Submit Application'}
                  </Button>
                </div>
              </>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default DriverRegisterPage;
