import prisma from "../../../config/prisma.js";

class TallyService {
  /**
   * Generate Tally XML for Sales
   * This is a simplified version of Tally XML format
   */
  async generateSalesXml(tenantId, fromDate, toDate) {
    const sales = await prisma.sale.findMany({
      where: {
        tenantId,
        soldAt: {
          gte: new Date(fromDate),
          lte: new Date(toDate),
        },
        status: 'COMPLETED',
      },
      include: {
        items: { include: { medicine: true } },
        patient: true,
        invoice: true,
      },
    });

    let xml = `<?xml version="1.0"?>
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
            </REQUESTDESC>
            <REQUESTDATA>`;

    sales.forEach(sale => {
      const date = sale.soldAt.toISOString().slice(0, 10).replace(/-/g, '');
      const invoiceNo = sale.invoice?.invoiceNumber || sale.id;
      const partyName = sale.patient?.fullName || 'Cash Patient';

      xml += `
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting VoucherView">
                        <DATE>${date}</DATE>
                        <VOUCHERNUMBER>${invoiceNo}</VOUCHERNUMBER>
                        <PARTYLEDGERNAME>${partyName}</PARTYLEDGERNAME>
                        <PERSISTEDVIEW>Accounting VoucherView</PERSISTEDVIEW>
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>${partyName}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>-${sale.totalAmount}</AMOUNT>
                        </ALLLEDGERENTRIES.LIST>
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>Sales Account</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                            <AMOUNT>${sale.subtotal}</AMOUNT>
                        </ALLLEDGERENTRIES.LIST>
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>Output GST</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                            <AMOUNT>${sale.gstAmount}</AMOUNT>
                        </ALLLEDGERENTRIES.LIST>
                    </VOUCHER>
                </TALLYMESSAGE>`;
    });

    xml += `
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>`;

    return xml;
  }

  async getExportHistory(tenantId) {
    return prisma.tallyExport.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async recordExport(tenantId, data) {
    return prisma.tallyExport.create({
      data: {
        ...data,
        tenantId
      }
    });
  }
}

export default new TallyService();
