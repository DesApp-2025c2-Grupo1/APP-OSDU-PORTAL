class AffiliateModel {
    constructor(reqBody) {
        this.credencial_number = ""; //Se calcula en el momento de la creacio
        this.document_number = reqBody.document_number;
        this.document_type = reqBody.document_type;
        this.birth_date = reqBody.birth_date;
        this.first_name = reqBody.first_name;
        this.last_name = reqBody.last_name;
        this.email = reqBody.email;
        this.phone = reqBody.phone;
        this.address = reqBody.address;
        this.city = reqBody.city;
        this.province = reqBody.province;
        this.postal_code = reqBody.postal_code;
        this.country = reqBody.country || null;
        this.plan_id = reqBody.plan_id;
        this.user_id = null;
        this.status = false;

        // Attach document paths if provided dynamically
        if (reqBody.dni_document_path) this.dni_document_path = reqBody.dni_document_path;
        if (reqBody.payslip_document_path) this.payslip_document_path = reqBody.payslip_document_path;
    }
}

module.exports = AffiliateModel;