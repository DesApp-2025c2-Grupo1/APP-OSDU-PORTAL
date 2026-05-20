class AffiliateModel {
    constructor(reqBody) {
        this.nro_credencial = ""; // Se calcula en el momento de la creación
        this.nro_documento = reqBody.nroDocumento;
        this.tipo_documento = reqBody.tipoDocumento;
        this.fecha_nacimiento = reqBody.fechaNacimiento;
        this.nombre = reqBody.nombre;
        this.apellido = reqBody.apellido;
        this.email = reqBody.email;
        this.telefono = reqBody.telefono;
        this.direccion = reqBody.direccion;
        this.localidad = reqBody.localidad;
        this.provincia = reqBody.provincia;
        this.codigo_postal = reqBody.codigoPostal;
        this.pais = reqBody.pais || null;
        this.plan_id = reqBody.idPlan;
        this.usuario_id = null;
        this.activo = false;

        // Attach document paths if provided dynamically
        if (reqBody.ruta_documento_dni) this.ruta_documento_dni = reqBody.ruta_documento_dni;
        if (reqBody.ruta_recibo_sueldo) this.ruta_recibo_sueldo = reqBody.ruta_recibo_sueldo;
    }
}

module.exports = AffiliateModel;
