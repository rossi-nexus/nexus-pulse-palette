/** Ontology types */

export interface OntologyCategory {
  id: string;
  type: 'capability' | 'competence' | 'domain' | 'product_type' | 'service_type';
  normalizedName: string;
  description?: string;
  sortOrder: number;
  status: 'active' | 'proposed' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface OntologyEntry {
  id: string;
  categoryId?: string;
  rawName: string;
  description?: string;
  sortOrder: number;
  status: 'active' | 'proposed' | 'archived';
  createdAt: string;
  updatedAt: string;
}
