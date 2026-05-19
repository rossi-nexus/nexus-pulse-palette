-- B1-fix3-prep Part 2: guards + domain drops + reparent + delete + insert
-- Steps 0 (G1/G2), 3, 4, 5, 6 from v3-copilot/ontology-seed/99-migration.sql

CREATE TEMP TABLE _old_cat_ids AS
  SELECT id, type, normalized_name FROM public.ontology_categories;

DO $guards$
DECLARE v_count int; v_detail text;
BEGIN
  -- G1: every old category with active entries is covered by reparent ∪ new ∪ drops
  WITH covered(type, normalized_name) AS (VALUES
    ('capability','Business & Governance'),('capability','C4ISR'),('capability','C4ISR, Communications & PNT'),
    ('capability','Communications'),('capability','Cybersecurity'),('capability','Electronic Warfare'),
    ('capability','Energy & Critical Infrastructure'),('capability','Energy & Infrastructure'),
    ('capability','Environmental Monitoring'),('capability','Healthcare & Medical'),('capability','Infrastructure'),
    ('capability','Integration & Systems'),('capability','Logistics & Supply Chain'),
    ('capability','Logistics, Supply Chain & Mobility'),('capability','Manufacturing & Engineering'),
    ('capability','Maritime'),('capability','Maritime & Subsea'),('capability','Navigation & Positioning'),
    ('capability','Platforms'),('capability','Platforms (Air, Land, Sea, Unmanned)'),
    ('capability','Preparedness'),('capability','Preparedness, Response & Medical'),
    ('capability','Sensors & Detection'),('capability','Software & Digital'),
    ('capability','Software, Systems & Integration'),('capability','Space'),('capability','Training & Simulation'),
    ('capability','Water & Subsea'),('capability','Weapons & Munitions'),
    ('competence','Business & Governance'),('competence','C4ISR'),('competence','C4ISR, Communications & PNT'),
    ('competence','Communications'),('competence','Cybersecurity'),('competence','Electronic Warfare'),
    ('competence','Energy & Critical Infrastructure'),('competence','Energy & Infrastructure'),
    ('competence','Environmental Monitoring'),('competence','Healthcare & Medical'),
    ('competence','Integration & Systems'),('competence','Logistics & Supply Chain'),
    ('competence','Logistics, Supply Chain & Mobility'),('competence','Manufacturing & Engineering'),
    ('competence','Maritime'),('competence','Maritime & Subsea'),('competence','Navigation & Positioning'),
    ('competence','Platforms'),('competence','Preparedness, Response & Medical'),
    ('competence','Regulatory & Compliance'),('competence','Sensors & Detection'),
    ('competence','Software & Digital'),('competence','Software, Systems & Integration'),
    ('competence','Space'),('competence','Training & Simulation'),
    ('domain','Air Operations'),('domain','Arctic & High North Operations'),('domain','Arctic Operations'),
    ('domain','CBRN'),('domain','CBRN & Nuclear'),('domain','Civil Protection'),
    ('domain','Civil Protection & Emergency Response'),('domain','Critical Infrastructure'),
    ('domain','Critical Infrastructure Protection'),('domain','Cyber'),('domain','Cyber & Information Operations'),
    ('domain','Energy'),('domain','Environmental Monitoring'),('domain','Healthcare & Medical Response'),
    ('domain','Humanitarian & Disaster Relief'),('domain','Intelligence'),('domain','Land Operations'),
    ('domain','Law Enforcement'),('domain','Law Enforcement & Public Safety'),('domain','Maritime'),
    ('domain','Maritime & Coastal Operations'),('domain','Medical & Health'),('domain','Nuclear'),
    ('domain','Offshore & Subsea'),('domain','Pipeline & Transport'),('domain','Search & Rescue'),
    ('domain','Space'),('domain','Space Operations'),('domain','Special Operations'),
    ('domain','Surveillance & Reconnaissance'),('domain','Surveillance & Reconnaissance (ISR)'),
    ('domain','Telecom'),('domain','Training & Exercise'),('domain','Urban & Built Environment'),
    ('product_type','AIS system'),('product_type','AUV'),('product_type','Ammunition'),('product_type','Antenna system'),
    ('product_type','Battery / energy storage'),('product_type','Body armor / protective equipment'),
    ('product_type','Buoy'),('product_type','C2 software'),('product_type','C4 & Mission Software'),
    ('product_type','CBRN, Medical & Life Support Systems'),('product_type','Camera system (EO/IR)'),
    ('product_type','Communication radio'),('product_type','Communications & Networking'),
    ('product_type','Components & Sub-Assemblies'),('product_type','Composite component'),
    ('product_type','Data fusion platform'),('product_type','Data link'),('product_type','Decontamination system'),
    ('product_type','Electronic Warfare & Cryptographic Systems'),('product_type','Encryption device'),
    ('product_type','Field hospital / medical unit'),('product_type','Fuel cell / microgrid'),
    ('product_type','Generator / power supply'),('product_type','Integration platform'),('product_type','Jammer'),
    ('product_type','LiDAR'),('product_type','Machined component (metal)'),
    ('product_type','Manned Platforms (Vessels, Vehicles, Aircraft)'),('product_type','Missile / effector system'),
    ('product_type','Navigation & PNT Systems'),('product_type','Navigation system (GNSS/INS)'),
    ('product_type','PCB / circuit board'),('product_type','Personal & Field Equipment'),
    ('product_type','Power & Energy Systems'),('product_type','ROV'),('product_type','Radar'),
    ('product_type','SATCOM terminal'),('product_type','SIGINT receiver'),('product_type','Sensors (Acoustic & Sonar)'),
    ('product_type','Sensors (EO/IR & LiDAR)'),('product_type','Sensors (RF, Radar & SIGINT)'),
    ('product_type','Shelter / temporary structure'),('product_type','Simulation platform'),('product_type','Sonar'),
    ('product_type','Spectrum analyzer'),('product_type','UAV (fixed-wing)'),('product_type','UAV (rotary)'),
    ('product_type','USV'),('product_type','Unmanned Air Platforms'),
    ('product_type','Unmanned Surface & Subsea Platforms'),('product_type','Vessel'),
    ('product_type','Water purification system'),('product_type','Weapons, Munitions & Effectors'),
    ('service_type','Advisory & Consulting'),('service_type','Architecture design'),('service_type','Calibration'),
    ('service_type','Consulting & advisory'),('service_type','Cyber & Information Security Services'),
    ('service_type','Decontamination service'),('service_type','Design & Engineering Services'),
    ('service_type','EW assessment'),('service_type','Emergency & Crisis Response'),('service_type','Emergency response'),
    ('service_type','Evacuation service'),('service_type','Exercise design & evaluation'),
    ('service_type','Fleet management'),('service_type','Inspection & Survey'),
    ('service_type','Inspection (subsea/structural)'),('service_type','Installation'),
    ('service_type','Logistics & Transport'),('service_type','Logistics & transport'),
    ('service_type','Maintenance & repair'),('service_type','Maintenance, Repair & Overhaul'),
    ('service_type','Medical & Health Services'),('service_type','Medical support'),('service_type','Network design'),
    ('service_type','Operations & Platform Services'),('service_type','Penetration testing'),
    ('service_type','Platform operation (vessel/aircraft/drone)'),('service_type','Project & Programme Management'),
    ('service_type','Project management'),('service_type','Secure network design'),('service_type','Security advisory'),
    ('service_type','Spectrum management'),('service_type','Systems Integration & Installation'),
    ('service_type','Systems integration'),('service_type','Testing & validation'),
    ('service_type','Testing, Validation & Certification'),('service_type','Training & Exercise Services'),
    ('service_type','Training & education'),('service_type','Vessel design')
  ),
  unmapped AS (
    SELECT oc.type, oc.normalized_name, COUNT(oe.id) AS n
    FROM public.ontology_categories oc
    LEFT JOIN public.ontology_entries oe ON oe.category_id = oc.id AND oe.status = 'active'
    LEFT JOIN covered c ON c.type = oc.type AND c.normalized_name = oc.normalized_name
    WHERE c.normalized_name IS NULL
    GROUP BY oc.type, oc.normalized_name
    HAVING COUNT(oe.id) > 0
  )
  SELECT COUNT(*), string_agg(type || '/' || normalized_name, ', ') INTO v_count, v_detail FROM unmapped;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'G1 ABORT: % unmapped categories with active entries: %', v_count, v_detail;
  END IF;

  -- G2: production-tagged entries' categories are covered
  WITH covered(type, normalized_name) AS (VALUES
    ('capability','Business & Governance'),('capability','C4ISR'),('capability','C4ISR, Communications & PNT'),
    ('capability','Communications'),('capability','Cybersecurity'),('capability','Electronic Warfare'),
    ('capability','Energy & Critical Infrastructure'),('capability','Energy & Infrastructure'),
    ('capability','Environmental Monitoring'),('capability','Healthcare & Medical'),('capability','Infrastructure'),
    ('capability','Integration & Systems'),('capability','Logistics & Supply Chain'),
    ('capability','Logistics, Supply Chain & Mobility'),('capability','Manufacturing & Engineering'),
    ('capability','Maritime'),('capability','Maritime & Subsea'),('capability','Navigation & Positioning'),
    ('capability','Platforms'),('capability','Platforms (Air, Land, Sea, Unmanned)'),
    ('capability','Preparedness'),('capability','Preparedness, Response & Medical'),
    ('capability','Sensors & Detection'),('capability','Software & Digital'),
    ('capability','Software, Systems & Integration'),('capability','Space'),('capability','Training & Simulation'),
    ('capability','Water & Subsea'),('capability','Weapons & Munitions'),
    ('competence','Business & Governance'),('competence','C4ISR'),('competence','C4ISR, Communications & PNT'),
    ('competence','Communications'),('competence','Cybersecurity'),('competence','Electronic Warfare'),
    ('competence','Energy & Critical Infrastructure'),('competence','Energy & Infrastructure'),
    ('competence','Environmental Monitoring'),('competence','Healthcare & Medical'),
    ('competence','Integration & Systems'),('competence','Logistics & Supply Chain'),
    ('competence','Logistics, Supply Chain & Mobility'),('competence','Manufacturing & Engineering'),
    ('competence','Maritime'),('competence','Maritime & Subsea'),('competence','Navigation & Positioning'),
    ('competence','Platforms'),('competence','Preparedness, Response & Medical'),
    ('competence','Regulatory & Compliance'),('competence','Sensors & Detection'),
    ('competence','Software & Digital'),('competence','Software, Systems & Integration'),
    ('competence','Space'),('competence','Training & Simulation'),
    ('domain','Air Operations'),('domain','Arctic & High North Operations'),('domain','Arctic Operations'),
    ('domain','CBRN'),('domain','CBRN & Nuclear'),('domain','Civil Protection'),
    ('domain','Civil Protection & Emergency Response'),('domain','Critical Infrastructure'),
    ('domain','Critical Infrastructure Protection'),('domain','Cyber'),('domain','Cyber & Information Operations'),
    ('domain','Energy'),('domain','Environmental Monitoring'),('domain','Healthcare & Medical Response'),
    ('domain','Humanitarian & Disaster Relief'),('domain','Intelligence'),('domain','Land Operations'),
    ('domain','Law Enforcement'),('domain','Law Enforcement & Public Safety'),('domain','Maritime'),
    ('domain','Maritime & Coastal Operations'),('domain','Medical & Health'),('domain','Nuclear'),
    ('domain','Offshore & Subsea'),('domain','Pipeline & Transport'),('domain','Search & Rescue'),
    ('domain','Space'),('domain','Space Operations'),('domain','Special Operations'),
    ('domain','Surveillance & Reconnaissance'),('domain','Surveillance & Reconnaissance (ISR)'),
    ('domain','Telecom'),('domain','Training & Exercise'),('domain','Urban & Built Environment'),
    ('product_type','AIS system'),('product_type','AUV'),('product_type','Ammunition'),('product_type','Antenna system'),
    ('product_type','Battery / energy storage'),('product_type','Body armor / protective equipment'),
    ('product_type','Buoy'),('product_type','C2 software'),('product_type','C4 & Mission Software'),
    ('product_type','CBRN, Medical & Life Support Systems'),('product_type','Camera system (EO/IR)'),
    ('product_type','Communication radio'),('product_type','Communications & Networking'),
    ('product_type','Components & Sub-Assemblies'),('product_type','Composite component'),
    ('product_type','Data fusion platform'),('product_type','Data link'),('product_type','Decontamination system'),
    ('product_type','Electronic Warfare & Cryptographic Systems'),('product_type','Encryption device'),
    ('product_type','Field hospital / medical unit'),('product_type','Fuel cell / microgrid'),
    ('product_type','Generator / power supply'),('product_type','Integration platform'),('product_type','Jammer'),
    ('product_type','LiDAR'),('product_type','Machined component (metal)'),
    ('product_type','Manned Platforms (Vessels, Vehicles, Aircraft)'),('product_type','Missile / effector system'),
    ('product_type','Navigation & PNT Systems'),('product_type','Navigation system (GNSS/INS)'),
    ('product_type','PCB / circuit board'),('product_type','Personal & Field Equipment'),
    ('product_type','Power & Energy Systems'),('product_type','ROV'),('product_type','Radar'),
    ('product_type','SATCOM terminal'),('product_type','SIGINT receiver'),('product_type','Sensors (Acoustic & Sonar)'),
    ('product_type','Sensors (EO/IR & LiDAR)'),('product_type','Sensors (RF, Radar & SIGINT)'),
    ('product_type','Shelter / temporary structure'),('product_type','Simulation platform'),('product_type','Sonar'),
    ('product_type','Spectrum analyzer'),('product_type','UAV (fixed-wing)'),('product_type','UAV (rotary)'),
    ('product_type','USV'),('product_type','Unmanned Air Platforms'),
    ('product_type','Unmanned Surface & Subsea Platforms'),('product_type','Vessel'),
    ('product_type','Water purification system'),('product_type','Weapons, Munitions & Effectors'),
    ('service_type','Advisory & Consulting'),('service_type','Architecture design'),('service_type','Calibration'),
    ('service_type','Consulting & advisory'),('service_type','Cyber & Information Security Services'),
    ('service_type','Decontamination service'),('service_type','Design & Engineering Services'),
    ('service_type','EW assessment'),('service_type','Emergency & Crisis Response'),('service_type','Emergency response'),
    ('service_type','Evacuation service'),('service_type','Exercise design & evaluation'),
    ('service_type','Fleet management'),('service_type','Inspection & Survey'),
    ('service_type','Inspection (subsea/structural)'),('service_type','Installation'),
    ('service_type','Logistics & Transport'),('service_type','Logistics & transport'),
    ('service_type','Maintenance & repair'),('service_type','Maintenance, Repair & Overhaul'),
    ('service_type','Medical & Health Services'),('service_type','Medical support'),('service_type','Network design'),
    ('service_type','Operations & Platform Services'),('service_type','Penetration testing'),
    ('service_type','Platform operation (vessel/aircraft/drone)'),('service_type','Project & Programme Management'),
    ('service_type','Project management'),('service_type','Secure network design'),('service_type','Security advisory'),
    ('service_type','Spectrum management'),('service_type','Systems Integration & Installation'),
    ('service_type','Systems integration'),('service_type','Testing & validation'),
    ('service_type','Testing, Validation & Certification'),('service_type','Training & Exercise Services'),
    ('service_type','Training & education'),('service_type','Vessel design')
  )
  SELECT COUNT(*) INTO v_count
  FROM public.actor_ontology_tags aot
  JOIN public.ontology_entries oe ON oe.id = aot.ontology_entry_id
  JOIN public.ontology_categories oc ON oc.id = oe.category_id
  LEFT JOIN covered c ON c.type = oc.type AND c.normalized_name = oc.normalized_name
  WHERE c.normalized_name IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'G2 ABORT: % production-tagged entries would be orphaned', v_count;
  END IF;
END $guards$;

-- STEP 3: cross-headline domain drops
UPDATE public.ontology_entries SET category_id = (
  SELECT id FROM public.ontology_categories WHERE type='capability' AND normalized_name='Sensors & Detection')
WHERE category_id = (SELECT id FROM public.ontology_categories WHERE type='domain' AND normalized_name='Environmental Monitoring');

UPDATE public.ontology_entries SET category_id = (
  SELECT id FROM public.ontology_categories WHERE type='service_type' AND normalized_name='Training & Exercise Services')
WHERE category_id = (SELECT id FROM public.ontology_categories WHERE type='domain' AND normalized_name='Training & Exercise');

-- STEP 4: re-parent 114 old categories' entries onto new sub-categories
WITH reparent_map(old_type, old_normalized_name, new_normalized_name) AS (VALUES
  ('capability', 'C4ISR', 'C4ISR, Communications & PNT'),
  ('capability', 'Communications', 'C4ISR, Communications & PNT'),
  ('capability', 'Navigation & Positioning', 'C4ISR, Communications & PNT'),
  ('capability', 'Cybersecurity', 'Cybersecurity'),
  ('capability', 'Electronic Warfare', 'Electronic Warfare'),
  ('capability', 'Energy & Infrastructure', 'Energy & Critical Infrastructure'),
  ('capability', 'Infrastructure', 'Energy & Critical Infrastructure'),
  ('capability', 'Logistics & Supply Chain', 'Logistics, Supply Chain & Mobility'),
  ('capability', 'Maritime', 'Maritime & Subsea'),
  ('capability', 'Water & Subsea', 'Maritime & Subsea'),
  ('capability', 'Platforms', 'Platforms (Air, Land, Sea, Unmanned)'),
  ('capability', 'Preparedness', 'Preparedness, Response & Medical'),
  ('capability', 'Healthcare & Medical', 'Preparedness, Response & Medical'),
  ('capability', 'Environmental Monitoring', 'Sensors & Detection'),
  ('capability', 'Integration & Systems', 'Software, Systems & Integration'),
  ('capability', 'Software & Digital', 'Software, Systems & Integration'),
  ('capability', 'Space', 'Space'),
  ('competence', 'C4ISR', 'C4ISR, Communications & PNT'),
  ('competence', 'Communications', 'C4ISR, Communications & PNT'),
  ('competence', 'Navigation & Positioning', 'C4ISR, Communications & PNT'),
  ('competence', 'Cybersecurity', 'Cybersecurity'),
  ('competence', 'Electronic Warfare', 'Electronic Warfare'),
  ('competence', 'Energy & Infrastructure', 'Energy & Critical Infrastructure'),
  ('competence', 'Logistics & Supply Chain', 'Logistics, Supply Chain & Mobility'),
  ('competence', 'Maritime', 'Maritime & Subsea'),
  ('competence', 'Healthcare & Medical', 'Preparedness, Response & Medical'),
  ('competence', 'Environmental Monitoring', 'Sensors & Detection'),
  ('competence', 'Integration & Systems', 'Software, Systems & Integration'),
  ('competence', 'Software & Digital', 'Software, Systems & Integration'),
  ('competence', 'Space', 'Space'),
  ('domain', 'Maritime', 'Maritime & Coastal Operations'),
  ('domain', 'Offshore & Subsea', 'Maritime & Coastal Operations'),
  ('domain', 'Land Operations', 'Land Operations'),
  ('domain', 'Special Operations', 'Land Operations'),
  ('domain', 'Urban & Built Environment', 'Land Operations'),
  ('domain', 'Space', 'Space Operations'),
  ('domain', 'Cyber', 'Cyber & Information Operations'),
  ('domain', 'Intelligence', 'Cyber & Information Operations'),
  ('domain', 'Surveillance & Reconnaissance', 'Surveillance & Reconnaissance (ISR)'),
  ('domain', 'Critical Infrastructure', 'Critical Infrastructure Protection'),
  ('domain', 'Energy', 'Critical Infrastructure Protection'),
  ('domain', 'Pipeline & Transport', 'Critical Infrastructure Protection'),
  ('domain', 'Telecom', 'Critical Infrastructure Protection'),
  ('domain', 'Civil Protection', 'Civil Protection & Emergency Response'),
  ('domain', 'Humanitarian & Disaster Relief', 'Civil Protection & Emergency Response'),
  ('domain', 'Search & Rescue', 'Civil Protection & Emergency Response'),
  ('domain', 'CBRN', 'CBRN & Nuclear'),
  ('domain', 'Nuclear', 'CBRN & Nuclear'),
  ('domain', 'Law Enforcement', 'Law Enforcement & Public Safety'),
  ('domain', 'Medical & Health', 'Healthcare & Medical Response'),
  ('domain', 'Arctic Operations', 'Arctic & High North Operations'),
  ('product_type', 'Camera system (EO/IR)', 'Sensors (EO/IR & LiDAR)'),
  ('product_type', 'LiDAR', 'Sensors (EO/IR & LiDAR)'),
  ('product_type', 'Radar', 'Sensors (RF, Radar & SIGINT)'),
  ('product_type', 'Antenna system', 'Sensors (RF, Radar & SIGINT)'),
  ('product_type', 'Spectrum analyzer', 'Sensors (RF, Radar & SIGINT)'),
  ('product_type', 'SIGINT receiver', 'Sensors (RF, Radar & SIGINT)'),
  ('product_type', 'Sonar', 'Sensors (Acoustic & Sonar)'),
  ('product_type', 'UAV (fixed-wing)', 'Unmanned Air Platforms'),
  ('product_type', 'UAV (rotary)', 'Unmanned Air Platforms'),
  ('product_type', 'USV', 'Unmanned Surface & Subsea Platforms'),
  ('product_type', 'AUV', 'Unmanned Surface & Subsea Platforms'),
  ('product_type', 'ROV', 'Unmanned Surface & Subsea Platforms'),
  ('product_type', 'Vessel', 'Manned Platforms (Vessels, Vehicles, Aircraft)'),
  ('product_type', 'Communication radio', 'Communications & Networking'),
  ('product_type', 'Data link', 'Communications & Networking'),
  ('product_type', 'SATCOM terminal', 'Communications & Networking'),
  ('product_type', 'AIS system', 'Communications & Networking'),
  ('product_type', 'C2 software', 'C4 & Mission Software'),
  ('product_type', 'Data fusion platform', 'C4 & Mission Software'),
  ('product_type', 'Integration platform', 'C4 & Mission Software'),
  ('product_type', 'Simulation platform', 'C4 & Mission Software'),
  ('product_type', 'Navigation system (GNSS/INS)', 'Navigation & PNT Systems'),
  ('product_type', 'Buoy', 'Navigation & PNT Systems'),
  ('product_type', 'Jammer', 'Electronic Warfare & Cryptographic Systems'),
  ('product_type', 'Encryption device', 'Electronic Warfare & Cryptographic Systems'),
  ('product_type', 'Missile / effector system', 'Weapons, Munitions & Effectors'),
  ('product_type', 'Ammunition', 'Weapons, Munitions & Effectors'),
  ('product_type', 'Battery / energy storage', 'Power & Energy Systems'),
  ('product_type', 'Fuel cell / microgrid', 'Power & Energy Systems'),
  ('product_type', 'Generator / power supply', 'Power & Energy Systems'),
  ('product_type', 'Decontamination system', 'CBRN, Medical & Life Support Systems'),
  ('product_type', 'Field hospital / medical unit', 'CBRN, Medical & Life Support Systems'),
  ('product_type', 'Water purification system', 'CBRN, Medical & Life Support Systems'),
  ('product_type', 'Body armor / protective equipment', 'Personal & Field Equipment'),
  ('product_type', 'Shelter / temporary structure', 'Personal & Field Equipment'),
  ('product_type', 'PCB / circuit board', 'Components & Sub-Assemblies'),
  ('product_type', 'Composite component', 'Components & Sub-Assemblies'),
  ('product_type', 'Machined component (metal)', 'Components & Sub-Assemblies'),
  ('service_type', 'Consulting & advisory', 'Advisory & Consulting'),
  ('service_type', 'Security advisory', 'Advisory & Consulting'),
  ('service_type', 'EW assessment', 'Advisory & Consulting'),
  ('service_type', 'Architecture design', 'Design & Engineering Services'),
  ('service_type', 'Network design', 'Design & Engineering Services'),
  ('service_type', 'Secure network design', 'Design & Engineering Services'),
  ('service_type', 'Vessel design', 'Design & Engineering Services'),
  ('service_type', 'Systems integration', 'Systems Integration & Installation'),
  ('service_type', 'Installation', 'Systems Integration & Installation'),
  ('service_type', 'Testing & validation', 'Testing, Validation & Certification'),
  ('service_type', 'Calibration', 'Testing, Validation & Certification'),
  ('service_type', 'Inspection (subsea/structural)', 'Inspection & Survey'),
  ('service_type', 'Maintenance & repair', 'Maintenance, Repair & Overhaul'),
  ('service_type', 'Platform operation (vessel/aircraft/drone)', 'Operations & Platform Services'),
  ('service_type', 'Fleet management', 'Operations & Platform Services'),
  ('service_type', 'Logistics & transport', 'Logistics & Transport'),
  ('service_type', 'Emergency response', 'Emergency & Crisis Response'),
  ('service_type', 'Evacuation service', 'Emergency & Crisis Response'),
  ('service_type', 'Decontamination service', 'Emergency & Crisis Response'),
  ('service_type', 'Medical support', 'Medical & Health Services'),
  ('service_type', 'Training & education', 'Training & Exercise Services'),
  ('service_type', 'Exercise design & evaluation', 'Training & Exercise Services'),
  ('service_type', 'Project management', 'Project & Programme Management'),
  ('service_type', 'Penetration testing', 'Cyber & Information Security Services'),
  ('service_type', 'Spectrum management', 'Cyber & Information Security Services')
)
UPDATE public.ontology_entries oe
SET category_id = new_cat.id
FROM public.ontology_categories old_cat
JOIN reparent_map mp ON mp.old_type = old_cat.type AND mp.old_normalized_name = old_cat.normalized_name
JOIN public.ontology_categories new_cat ON new_cat.type = old_cat.type AND new_cat.normalized_name = mp.new_normalized_name
WHERE oe.category_id = old_cat.id
  AND old_cat.id <> new_cat.id;

-- STEP 5: pre-delete check + delete obsolete categories
DO $del$
DECLARE v_count int; v_detail text;
BEGIN
  WITH new_names(type, normalized_name) AS (VALUES
    ('capability','Business & Governance'),('capability','C4ISR, Communications & PNT'),
    ('capability','Cybersecurity'),('capability','Electronic Warfare'),
    ('capability','Energy & Critical Infrastructure'),('capability','Logistics, Supply Chain & Mobility'),
    ('capability','Manufacturing & Engineering'),('capability','Maritime & Subsea'),
    ('capability','Platforms (Air, Land, Sea, Unmanned)'),('capability','Preparedness, Response & Medical'),
    ('capability','Sensors & Detection'),('capability','Software, Systems & Integration'),
    ('capability','Space'),('capability','Training & Simulation'),('capability','Weapons & Munitions'),
    ('competence','Business & Governance'),('competence','C4ISR, Communications & PNT'),
    ('competence','Cybersecurity'),('competence','Electronic Warfare'),
    ('competence','Energy & Critical Infrastructure'),('competence','Logistics, Supply Chain & Mobility'),
    ('competence','Manufacturing & Engineering'),('competence','Maritime & Subsea'),
    ('competence','Platforms'),('competence','Preparedness, Response & Medical'),
    ('competence','Sensors & Detection'),('competence','Software, Systems & Integration'),
    ('competence','Space'),('competence','Training & Simulation'),('competence','Regulatory & Compliance'),
    ('domain','Maritime & Coastal Operations'),('domain','Land Operations'),('domain','Air Operations'),
    ('domain','Space Operations'),('domain','Cyber & Information Operations'),
    ('domain','Surveillance & Reconnaissance (ISR)'),('domain','Critical Infrastructure Protection'),
    ('domain','Civil Protection & Emergency Response'),('domain','CBRN & Nuclear'),
    ('domain','Law Enforcement & Public Safety'),('domain','Healthcare & Medical Response'),
    ('domain','Arctic & High North Operations'),
    ('product_type','Sensors (EO/IR & LiDAR)'),('product_type','Sensors (RF, Radar & SIGINT)'),
    ('product_type','Sensors (Acoustic & Sonar)'),('product_type','Unmanned Air Platforms'),
    ('product_type','Unmanned Surface & Subsea Platforms'),
    ('product_type','Manned Platforms (Vessels, Vehicles, Aircraft)'),
    ('product_type','Communications & Networking'),('product_type','C4 & Mission Software'),
    ('product_type','Navigation & PNT Systems'),('product_type','Electronic Warfare & Cryptographic Systems'),
    ('product_type','Weapons, Munitions & Effectors'),('product_type','Power & Energy Systems'),
    ('product_type','CBRN, Medical & Life Support Systems'),('product_type','Personal & Field Equipment'),
    ('product_type','Components & Sub-Assemblies'),
    ('service_type','Advisory & Consulting'),('service_type','Design & Engineering Services'),
    ('service_type','Systems Integration & Installation'),('service_type','Testing, Validation & Certification'),
    ('service_type','Inspection & Survey'),('service_type','Maintenance, Repair & Overhaul'),
    ('service_type','Operations & Platform Services'),('service_type','Logistics & Transport'),
    ('service_type','Emergency & Crisis Response'),('service_type','Medical & Health Services'),
    ('service_type','Training & Exercise Services'),('service_type','Project & Programme Management'),
    ('service_type','Cyber & Information Security Services')
  ),
  to_delete AS (
    SELECT old.id, old.type, old.normalized_name FROM _old_cat_ids old
    LEFT JOIN new_names nn ON nn.type = old.type AND nn.normalized_name = old.normalized_name
    WHERE nn.normalized_name IS NULL
  ),
  leftover AS (
    SELECT td.type, td.normalized_name, COUNT(oe.id) AS n
    FROM public.ontology_entries oe
    JOIN to_delete td ON td.id = oe.category_id
    GROUP BY td.type, td.normalized_name
  )
  SELECT COUNT(*), string_agg(type || '/' || normalized_name || '(' || n || ')', ', ')
    INTO v_count, v_detail FROM leftover;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'STEP 5 ABORT: % to-be-deleted categories still have entries: %', v_count, v_detail;
  END IF;

  WITH new_names(type, normalized_name) AS (VALUES
    ('capability','Business & Governance'),('capability','C4ISR, Communications & PNT'),
    ('capability','Cybersecurity'),('capability','Electronic Warfare'),
    ('capability','Energy & Critical Infrastructure'),('capability','Logistics, Supply Chain & Mobility'),
    ('capability','Manufacturing & Engineering'),('capability','Maritime & Subsea'),
    ('capability','Platforms (Air, Land, Sea, Unmanned)'),('capability','Preparedness, Response & Medical'),
    ('capability','Sensors & Detection'),('capability','Software, Systems & Integration'),
    ('capability','Space'),('capability','Training & Simulation'),('capability','Weapons & Munitions'),
    ('competence','Business & Governance'),('competence','C4ISR, Communications & PNT'),
    ('competence','Cybersecurity'),('competence','Electronic Warfare'),
    ('competence','Energy & Critical Infrastructure'),('competence','Logistics, Supply Chain & Mobility'),
    ('competence','Manufacturing & Engineering'),('competence','Maritime & Subsea'),
    ('competence','Platforms'),('competence','Preparedness, Response & Medical'),
    ('competence','Sensors & Detection'),('competence','Software, Systems & Integration'),
    ('competence','Space'),('competence','Training & Simulation'),('competence','Regulatory & Compliance'),
    ('domain','Maritime & Coastal Operations'),('domain','Land Operations'),('domain','Air Operations'),
    ('domain','Space Operations'),('domain','Cyber & Information Operations'),
    ('domain','Surveillance & Reconnaissance (ISR)'),('domain','Critical Infrastructure Protection'),
    ('domain','Civil Protection & Emergency Response'),('domain','CBRN & Nuclear'),
    ('domain','Law Enforcement & Public Safety'),('domain','Healthcare & Medical Response'),
    ('domain','Arctic & High North Operations'),
    ('product_type','Sensors (EO/IR & LiDAR)'),('product_type','Sensors (RF, Radar & SIGINT)'),
    ('product_type','Sensors (Acoustic & Sonar)'),('product_type','Unmanned Air Platforms'),
    ('product_type','Unmanned Surface & Subsea Platforms'),
    ('product_type','Manned Platforms (Vessels, Vehicles, Aircraft)'),
    ('product_type','Communications & Networking'),('product_type','C4 & Mission Software'),
    ('product_type','Navigation & PNT Systems'),('product_type','Electronic Warfare & Cryptographic Systems'),
    ('product_type','Weapons, Munitions & Effectors'),('product_type','Power & Energy Systems'),
    ('product_type','CBRN, Medical & Life Support Systems'),('product_type','Personal & Field Equipment'),
    ('product_type','Components & Sub-Assemblies'),
    ('service_type','Advisory & Consulting'),('service_type','Design & Engineering Services'),
    ('service_type','Systems Integration & Installation'),('service_type','Testing, Validation & Certification'),
    ('service_type','Inspection & Survey'),('service_type','Maintenance, Repair & Overhaul'),
    ('service_type','Operations & Platform Services'),('service_type','Logistics & Transport'),
    ('service_type','Emergency & Crisis Response'),('service_type','Medical & Health Services'),
    ('service_type','Training & Exercise Services'),('service_type','Project & Programme Management'),
    ('service_type','Cyber & Information Security Services')
  )
  DELETE FROM public.ontology_categories oc
  WHERE oc.id IN (
    SELECT old.id FROM _old_cat_ids old
    LEFT JOIN new_names nn ON nn.type = old.type AND nn.normalized_name = old.normalized_name
    WHERE nn.normalized_name IS NULL
  );
END $del$;

-- STEP 6: insert 285 new entries (from v3-copilot/ontology-seed/99-migration.sql)
INSERT INTO public.ontology_entries (category_id, raw_name, description, sort_order, status)
SELECT
  (SELECT id FROM public.ontology_categories WHERE type = e.category_type AND normalized_name = e.category_normalized_name),
  e.raw_name, e.description, e.sort_order, 'active'
FROM (
  SELECT category_type, category_normalized_name, raw_name, description, sort_order
  FROM (VALUES
    -- placeholder; actual 285 rows below via separate execution
    (NULL::text, NULL::text, NULL::text, NULL::text, NULL::int)
  ) v(category_type, category_normalized_name, raw_name, description, sort_order)
  WHERE FALSE
) AS e(category_type, category_normalized_name, raw_name, description, sort_order);
