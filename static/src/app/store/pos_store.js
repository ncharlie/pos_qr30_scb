import { PosStore } from "@point_of_sale/app/store/pos_store";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { QR30Popup } from "@pos_qr30_scb/app/utils/qr_code_popup/qr_code_popup";
import { ask } from "@point_of_sale/app/store/make_awaitable_dialog";
import { ConnectionLostError } from "@web/core/network/rpc";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";

const { DateTime } = luxon;

patch(PosStore.prototype, {
  async setup() {
    await super.setup(...arguments);
    this.bus.addChannel("qr30_payment_callback");
  },
  async showQR(payment) {
    if (payment.payment_method_id.qr_code_method != "qr30")
      return await super.showQR(payment);

    if (!this.isClicked) this.isClicked = true;
    else return;

    try {
      if (
        payment.get_payment_status() != "waitingPayment" ||
        payment.qr30_expire_time <= DateTime.now()
      ) {
        // generate new qr code
        const response = await this.data.call(
          "pos.payment.method",
          "get_qr_code",
          [
            [payment.payment_method_id.id],
            payment.amount,
            payment.pos_order_id.name,
            payment.pos_order_id.name,
            this.currency.id,
            payment.pos_order_id.partner_id?.id,
          ]
        );
        payment.setQRdata(response);
      }

      // format_amount: this.chrome.env.utils.formatCurrency(payment.amount)
      this.chrome.sendOrderToCustomerDisplay(this.get_order(), false);
      payment.pos_order_id.chrome = this.chrome;
      return await ask(
        this.env.services.dialog,
        {
          title: payment.name,
          line: payment,
          order: payment.pos_order_id,
          qrCode: payment.qr30_image,
        },
        {},
        QR30Popup
      );
    } catch (error) {
      console.log("error found");
      console.log(error);

      let message;
      if (error instanceof ConnectionLostError) {
        message = _t(
          "Connection to the server has been lost. Please check your internet connection."
        );
      } else {
        message = error.data.message;
      }
      this.env.services.dialog.add(AlertDialog, {
        title: _t("Failure to generate Payment QR Code"),
        body: message,
      });
      return false;
    } finally {
      this.isClicked = false;
    }
  },
});
