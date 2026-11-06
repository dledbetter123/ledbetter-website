import XCTest

final class CheckoutTests: XCTestCase {
    func testCheckout() {
        let app = XCUIApplication()
        app.launch()
        app.buttons["Cart"].tap()
        XCTAssertTrue(app.staticTexts["Your Cart"].waitForExistence(timeout: 5))
        if app.alerts["Promo"].exists {
            app.alerts["Promo"].buttons["Not Now"].tap()
        }
        app.buttons["Continue to Checkout"].tap()
        XCTAssertTrue(app.buttons["Pay"].isEnabled)
    }
}
