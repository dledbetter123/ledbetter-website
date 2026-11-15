import XCTest

final class CheckoutTests: XCTestCase {
    func testCheckout() {
        let app = XCUIApplication()
        app.launch()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        if springboard.alerts.buttons["Don't Allow"].waitForExistence(timeout: 2) {
            springboard.alerts.buttons["Don't Allow"].tap()
        }
        app.buttons["Cart"].tap()
        XCTAssertTrue(app.staticTexts["Your Cart"].waitForExistence(timeout: 5))
        if app.alerts["Promo"].exists {
            app.alerts["Promo"].buttons["Not Now"].tap()
        }
        app.buttons["Checkout"].tap()
        XCTAssertTrue(app.buttons["Pay"].isEnabled)
    }
}
