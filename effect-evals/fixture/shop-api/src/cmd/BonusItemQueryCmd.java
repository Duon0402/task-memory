package shop.cmd;

/** GET /bonus-items. Rows imported by the nightly batch job may have itemName == null. */
public class BonusItemQueryCmd {
  public static class Row {
    public String itemCode;   // never null
    public String itemName;   // nullable for batch-imported rows
    public java.math.BigDecimal amount;
  }
}
