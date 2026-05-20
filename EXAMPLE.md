# Notas para desarrollar

CREATE TABLE roles(
    id INT primary key auto_increment,
    role_name VARCHAR(255) NOT NULL,
    role_description VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users(
    id INT primary key auto_increment,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_roles(
    id INT primary key auto_increment,
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE affiliates(
    id INT primary key auto_increment,
    user_id INT NOT NULL,
    credencial_number VARCHAR(20) NOT NULL,
    document_number VARCHAR(10) NOT NULL,
    document_type VARCHAR(7) NOT NULL,   
    birth_date DATE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    affiliate_state_id INT NOT NULL,
    plan_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
// el tema de los correos y telefonos hay que verlo porque un afiliado puede tener mas de uno, por eso separamos en otras tablas. 
// por ahora lo dejamos asi, pero despues separamos en otras tablas.


//los planes que existen son - 210 - 310 - 410 - 510 | 210 (BRONCE) , 310 (PLATA), 410 (ORO), 510 (PLATINO)
//el afiliado puede tener un unico plan y su grupo familiar tendran el mismo
CREATE TABLE plans(
    id INT primary key auto_increment,
    plan_code VARCHAR(3) NOT NULL UNIQUE,
    plan_name VARCHAR(20) NOT NULL, // BRONCE - PLATA - ORO - PLATINO
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE affiliate_emails(
    id INT primary key auto_increment,
    affiliate_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE affiliate_phones(
    id INT primary key auto_increment,
    affiliate_id INT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE affiliate_states(
    id INT primary key auto_increment,
    affiliate_id INT NOT NULL,
    state VARCHAR(20) NOT NULL, // Pendiente, Activo, Inactivo.
    modificated_by VARCHAR(100) NOT NULL, // nombre del usuario que modifico el estado (admin)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


//Todo lo relacionado a prestadores

CREATE TABLE providers(
    id INT primary key auto_increment,
    user_id INT NOT NULL, -- el usuario creado por el admin
    cuit VARCHAR(20) NOT NULL UNIQUE, -- los prestadores se identifican por CUIT
    name VARCHAR(255) NOT NULL,
    role_id INT NOT NULL, -- los roles son asignados por el admin (ADMIN, PRESTADOR, AFILIADO),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

### Nota:
- El afiliado ingresa a la aplicación portal para afiliados o prestadores
- Inicia sesión o se registra
    - se crea usuario en user y en la tabla que corresponda (affiliate, provider)
- El administrador tiene otra vista en otra aplicación y el inicia sesión por esa aplicación 
- El administardor puede ver los datos de los afiliados, 
    - de los que estan pendientes de activacion y puede activar o desactivar la cuenta.
- El prestador puede ver los datos de los afiliados, y gestionar sus datos personales.
- El afiliado puede ver sus datos personales y gestionar sus datos personales.
