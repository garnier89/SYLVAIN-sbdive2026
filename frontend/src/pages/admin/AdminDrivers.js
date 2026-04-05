import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { adminAPI } from '../../services/api';
import { Check, X, Eye, Car, Motorcycle, Bicycle } from '@phosphor-icons/react';

const AdminDrivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadDrivers();
  }, [filter]);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter !== 'all') params.status = filter;
      const response = await adminAPI.listDrivers(params);
      setDrivers(response.data.drivers);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Load drivers error:', error);
    } finally {
      setLoading(false);
    }
  };

  const approveDriver = async (driverId) => {
    try {
      await adminAPI.approveDriver(driverId);
      loadDrivers();
    } catch (error) {
      console.error('Approve error:', error);
    }
  };

  const rejectDriver = async (driverId) => {
    try {
      await adminAPI.rejectDriver(driverId, 'Documents not valid');
      loadDrivers();
    } catch (error) {
      console.error('Reject error:', error);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-amber-100 text-amber-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return <Badge className={styles[status] || 'bg-gray-100'}>{status}</Badge>;
  };

  const getVehicleIcon = (type) => {
    const icons = { car: Car, motorcycle: Motorcycle, bicycle: Bicycle };
    const Icon = icons[type] || Car;
    return <Icon size={20} />;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Drivers</h1>
          <p className="text-muted-foreground">Manage driver accounts and approvals</p>
        </div>
        <div className="flex gap-2">
          {['all', 'pending', 'approved', 'rejected'].map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
              className={filter === f ? 'bg-primary text-white' : ''}
              data-testid={`filter-${f}`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>License</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Trips</TableHead>
                <TableHead>Earnings</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">Loading...</TableCell>
                </TableRow>
              ) : drivers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No drivers found
                  </TableCell>
                </TableRow>
              ) : (
                drivers.map((driver) => (
                  <TableRow key={driver.id} data-testid={`driver-row-${driver.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{driver.user?.name || 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">{driver.user?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getVehicleIcon(driver.vehicle_type)}
                        <div>
                          <p className="font-medium capitalize">{driver.vehicle_type}</p>
                          <p className="text-sm text-muted-foreground">{driver.vehicle_number}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{driver.license_number}</TableCell>
                    <TableCell>{getStatusBadge(driver.status)}</TableCell>
                    <TableCell>{driver.rating.toFixed(1)}</TableCell>
                    <TableCell>{driver.total_trips}</TableCell>
                    <TableCell>${driver.earnings.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {driver.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => approveDriver(driver.id)}
                              data-testid={`approve-${driver.id}`}
                            >
                              <Check size={18} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => rejectDriver(driver.id)}
                              data-testid={`reject-${driver.id}`}
                            >
                              <X size={18} />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`view-${driver.id}`}
                        >
                          <Eye size={18} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDrivers;
