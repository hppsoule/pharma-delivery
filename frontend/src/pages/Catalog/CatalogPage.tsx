import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Filter, ShoppingCart, AlertCircle, Plus, Minus, Upload, X, Check, FileText } from 'lucide-react';
import { Medicine, CartItem } from '../../types';
import apiService from '../../services/api';

const CatalogPage: React.FC = () => {
  const { t } = useTranslation();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPharmacy, setSelectedPharmacy] = useState('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // État pour la gestion des ordonnances
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const [prescriptionPreview, setPrescriptionPreview] = useState<string>('');
  const [uploadingPrescription, setUploadingPrescription] = useState(false);
  const [prescriptionUrl, setPrescriptionUrl] = useState<string>('');
  const [medicineRequiringPrescription, setMedicineRequiringPrescription] = useState<Medicine | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedCategory, selectedPharmacy, searchTerm]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load medicines with filters
      const params: any = {};
      if (selectedCategory !== 'all') params.category = selectedCategory;
      if (selectedPharmacy !== 'all') params.pharmacyId = selectedPharmacy;
      if (searchTerm) params.search = searchTerm;

      const [medicinesData, categoriesData, pharmaciesData] = await Promise.all([
        apiService.getMedicines(params),
        apiService.getMedicineCategories(),
        apiService.getPharmacies({ isOpen: 'true' })
      ]);

      setMedicines(medicinesData);
      setCategories(categoriesData);
      setPharmacies(pharmaciesData);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour convertir EUR en CFA
  const convertToCFA = (euroAmount: number): number => {
    // 1 EUR = 655.957 CFA (taux fixe)
    return Math.round(euroAmount * 655.957);
  };

  // Fonction pour formater le prix en CFA
  const formatCFA = (amount: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(convertToCFA(amount));
  };

  const addToCart = (medicine: Medicine) => {
    // Vérifier si le médicament nécessite une ordonnance
    if (medicine.requiresPrescription && !prescriptionUrl) {
      setMedicineRequiringPrescription(medicine);
      setShowPrescriptionModal(true);
      return;
    }
    
    // Si pas d'ordonnance requise ou déjà fournie, ajouter au panier
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.medicine.id === medicine.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.medicine.id === medicine.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCart, { medicine, quantity: 1 }];
    });
  };

  const removeFromCart = (medicineId: string) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.medicine.id === medicineId);
      if (existingItem && existingItem.quantity > 1) {
        return prevCart.map(item =>
          item.medicine.id === medicineId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        );
      }
      return prevCart.filter(item => item.medicine.id !== medicineId);
    });
  };

  const getCartItemQuantity = (medicineId: string) => {
    const item = cart.find(item => item.medicine.id === medicineId);
    return item ? item.quantity : 0;
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + (item.medicine.price * item.quantity), 0);
  };

  const getCartItemsCount = () => {
    return cart.reduce((count, item) => count + item.quantity, 0);
  };

  const handlePrescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert('La taille de l\'ordonnance ne doit pas dépasser 5MB');
        return;
      }
      
      if (!file.type.match('image.*') && !file.type.match('application/pdf')) {
        alert('Veuillez sélectionner une image ou un PDF');
        return;
      }

      setPrescriptionFile(file);
      
      // Créer un aperçu pour les images
      if (file.type.match('image.*')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPrescriptionPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        // Pour les PDF, afficher une icône
        setPrescriptionPreview('');
      }
    }
  };

  const uploadPrescription = async () => {
    if (!prescriptionFile) return;

    try {
      setUploadingPrescription(true);
      
      // Uploader l'ordonnance
      const uploadResult = await apiService.uploadImageFile(prescriptionFile, 'prescriptions');
      
      // Stocker l'URL de l'ordonnance
      setPrescriptionUrl(uploadResult.imageUrl);
      
      // Fermer le modal
      setShowPrescriptionModal(false);
      
      // Ajouter le médicament au panier si c'était une demande spécifique
      if (medicineRequiringPrescription) {
        setCart(prevCart => {
          const existingItem = prevCart.find(item => item.medicine.id === medicineRequiringPrescription.id);
          if (existingItem) {
            return prevCart.map(item =>
              item.medicine.id === medicineRequiringPrescription.id
                ? { ...item, quantity: item.quantity + 1 }
                : item
            );
          }
          return [...prevCart, { medicine: medicineRequiringPrescription, quantity: 1 }];
        });
        
        // Réinitialiser
        setMedicineRequiringPrescription(null);
      }
      
      alert('Ordonnance téléchargée avec succès!');
    } catch (err: any) {
      alert('Erreur lors du téléchargement de l\'ordonnance: ' + err.message);
    } finally {
      setUploadingPrescription(false);
    }
  };

  const handleCreateOrder = async () => {
    if (cart.length === 0) return;

    // Vérifier si des médicaments nécessitent une ordonnance
    const requiresPrescription = cart.some(item => item.medicine.requiresPrescription);
    
    if (requiresPrescription && !prescriptionUrl) {
      setShowPrescriptionModal(true);
      return;
    }

    try {
      // Group items by pharmacy
      const ordersByPharmacy = cart.reduce((acc, item) => {
        const pharmacyId = item.medicine.pharmacyId;
        if (!acc[pharmacyId]) {
          acc[pharmacyId] = [];
        }
        acc[pharmacyId].push({
          medicineId: item.medicine.id,
          quantity: item.quantity
        });
        return acc;
      }, {} as Record<string, any[]>);

      // Create orders for each pharmacy
      for (const [pharmacyId, items] of Object.entries(ordersByPharmacy)) {
        await apiService.createOrder({
          pharmacyId,
          items,
          prescriptionUrl: prescriptionUrl,
          deliveryAddress: {
            street: '123 Rue de la Santé',
            city: 'Paris',
            postalCode: '75001',
            country: 'France',
            latitude: 48.8566,
            longitude: 2.3522
          }
        });
      }

      setCart([]);
      setPrescriptionUrl('');
      setPrescriptionFile(null);
      setPrescriptionPreview('');
      alert('Commande(s) créée(s) avec succès!');
    } catch (err: any) {
      alert('Erreur lors de la création de la commande: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalogue de médicaments</h1>
          <p className="text-gray-600">Trouvez et commandez vos médicaments</p>
        </div>
        
        {cart.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4 min-w-64">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900">Panier ({getCartItemsCount()})</span>
              <span className="font-bold text-blue-600">{formatCFA(getCartTotal())}</span>
            </div>
            
            {/* Afficher l'état de l'ordonnance si nécessaire */}
            {cart.some(item => item.medicine.requiresPrescription) && (
              <div className="mb-2 text-sm">
                {prescriptionUrl ? (
                  <div className="flex items-center text-green-600">
                    <Check className="w-4 h-4 mr-1" />
                    <span>Ordonnance fournie</span>
                  </div>
                ) : (
                  <div className="flex items-center text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    <span>Ordonnance requise</span>
                    <button 
                      onClick={() => setShowPrescriptionModal(true)}
                      className="ml-2 text-blue-600 hover:text-blue-800 underline"
                    >
                      Ajouter
                    </button>
                  </div>
                )}
              </div>
            )}
            
            <button 
              onClick={handleCreateOrder}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Commander
            </button>
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Rechercher un médicament..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Toutes les catégories</option>
              {categories.map(category => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
            
            <select
              value={selectedPharmacy}
              onChange={(e) => setSelectedPharmacy(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Toutes les pharmacies</option>
              {pharmacies.map(pharmacy => (
                <option key={pharmacy.id} value={pharmacy.id}>
                  {pharmacy.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Medicine Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {medicines.map((medicine) => {
          const cartQuantity = getCartItemQuantity(medicine.id);
          
          return (
            <div key={medicine.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow">
              <div className="aspect-w-16 aspect-h-9">
                <img
                  src={medicine.imageUrl || 'https://images.pexels.com/photos/3683107/pexels-photo-3683107.jpeg'}
                  alt={medicine.name}
                  className="w-full h-48 object-cover rounded-t-lg"
                />
              </div>
              
              <div className="p-6">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{medicine.name}</h3>
                  {medicine.requiresPrescription && (
                    <div className="flex items-center text-red-600 text-xs">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      <span>Ordonnance</span>
                    </div>
                  )}
                </div>
                
                <p className="text-gray-600 text-sm mb-3">{medicine.description}</p>
                
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {medicine.category}
                  </span>
                  <span className="text-sm text-green-600">
                    {medicine.quantity} en stock
                  </span>
                </div>
                
                <div className="text-xs text-gray-500 mb-4">
                  {medicine.pharmacyName}
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-xl font-bold text-gray-900">
                    {formatCFA(medicine.price)}
                  </span>
                  
                  {cartQuantity > 0 ? (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => removeFromCart(medicine.id)}
                        className="bg-gray-200 text-gray-700 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="font-medium text-gray-900 min-w-8 text-center">
                        {cartQuantity}
                      </span>
                      <button
                        onClick={() => addToCart(medicine)}
                        className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(medicine)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      <span>Ajouter</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {medicines.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun médicament trouvé</h3>
          <p className="text-gray-600">Essayez de modifier vos critères de recherche</p>
        </div>
      )}

      {/* Modal d'upload d'ordonnance */}
      {showPrescriptionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {medicineRequiringPrescription 
                  ? `Ordonnance requise pour ${medicineRequiringPrescription.name}`
                  : 'Télécharger votre ordonnance'
                }
              </h3>
              <button
                onClick={() => {
                  setShowPrescriptionModal(false);
                  setMedicineRequiringPrescription(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600 mb-4">
                Certains médicaments de votre panier nécessitent une ordonnance médicale valide. 
                Veuillez télécharger une photo ou un scan de votre ordonnance.
              </p>
              
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                {prescriptionPreview ? (
                  <div className="mb-4">
                    <img 
                      src={prescriptionPreview} 
                      alt="Aperçu de l'ordonnance" 
                      className="max-h-48 mx-auto object-contain"
                    />
                  </div>
                ) : prescriptionFile && prescriptionFile.type.includes('pdf') ? (
                  <div className="mb-4 flex items-center justify-center">
                    <FileText className="w-16 h-16 text-red-500" />
                  </div>
                ) : (
                  <div className="mb-4">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                  </div>
                )}
                
                <label className="cursor-pointer">
                  <span className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors inline-flex items-center">
                    <Upload className="w-4 h-4 mr-2" />
                    {prescriptionFile ? 'Changer l\'ordonnance' : 'Sélectionner un fichier'}
                  </span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handlePrescriptionChange}
                    className="hidden"
                  />
                </label>
                
                <p className="text-xs text-gray-500 mt-2">
                  Formats acceptés: JPG, PNG, PDF (max 5MB)
                </p>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowPrescriptionModal(false);
                  setMedicineRequiringPrescription(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={uploadPrescription}
                disabled={!prescriptionFile || uploadingPrescription}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center"
              >
                {uploadingPrescription ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    <span>Téléchargement...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    <span>Télécharger</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CatalogPage;