-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "customerAddressLine1" TEXT,
ADD COLUMN     "customerAddressLine2" TEXT,
ADD COLUMN     "customerArea" TEXT,
ADD COLUMN     "customerCity" TEXT,
ADD COLUMN     "customerCountry" TEXT,
ADD COLUMN     "customerDistrict" TEXT,
ADD COLUMN     "customerGST" TEXT,
ADD COLUMN     "customerLandmark" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "customerPincode" TEXT,
ADD COLUMN     "customerState" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "aadhaarNumber" TEXT,
ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "area" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "gstNumber" TEXT,
ADD COLUMN     "landmark" TEXT,
ADD COLUMN     "panNumber" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "state" TEXT;
