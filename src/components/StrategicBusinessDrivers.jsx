// src/StrategicBusinessDrivers.jsx

import { useState } from "react";
import PropTypes from "prop-types";

const StrategicBusinessDrivers = ({ initialData = {}, onSave, onNext, onBack }) => {
  // Evaluate satisfaction with key business drivers
  const [customerSatisfaction, setCustomerSatisfaction] = useState(initialData.customerSatisfaction || "");
  const [productSatisfaction, setProductSatisfaction] = useState(initialData.productSatisfaction || "");
  const [efficiencySatisfaction, setEfficiencySatisfaction] = useState(initialData.efficiencySatisfaction || "");
  const [innovationSatisfaction, setInnovationSatisfaction] = useState(initialData.innovationSatisfaction || "");
  const [marketAdaptabilitySatisfaction, setMarketAdaptabilitySatisfaction] = useState(initialData.marketAdaptabilitySatisfaction || "");
  const [driversFollowUp, setDriversFollowUp] = useState(initialData.driversFollowUp || {});

  // External Trends & Their Impact
  const [trendInfluence, setTrendInfluence] = useState(initialData.trendInfluence || "");
  const [trendDetails, setTrendDetails] = useState(initialData.trendDetails || "");

  // Competitive Advantage Perception
  const [competitiveAdvantage, setCompetitiveAdvantage] = useState(initialData.competitiveAdvantage || "");
  const [competitiveDetails, setCompetitiveDetails] = useState(initialData.competitiveDetails || "");

  // Areas where additional support could be beneficial
  const [supportAreas, setSupportAreas] = useState(initialData.supportAreas || {});
  const [supportDetails, setSupportDetails] = useState(initialData.supportDetails || {});

  // Helper: Render a 1-5 rating radio group (with optional “Unknown”)
  const renderRating = (name, value, onChange, includeUnknown = false) => (
    <div className="rating-group" style={{ marginTop: "5px" }}>
      {[1, 2, 3, 4, 5].map((num) => (
        <label key={num} style={{ marginRight: "10px" }}>
          <input
            type="radio"
            name={name}
            value={num}
            checked={value === String(num)}
            onChange={(e) => onChange(e.target.value)}
          />
          {num}
        </label>
      ))}
      {includeUnknown && (
        <label style={{ marginRight: "10px" }}>
          <input
            type="radio"
            name={name}
            value="unknown"
            checked={value === "unknown"}
            onChange={(e) => onChange(e.target.value)}
          />
          Unknown
        </label>
      )}
    </div>
  );

  const handleSave = () => {
    const data = {
      customerSatisfaction,
      productSatisfaction,
      efficiencySatisfaction,
      innovationSatisfaction,
      marketAdaptabilitySatisfaction,
      driversFollowUp,
      trendInfluence,
      trendDetails,
      competitiveAdvantage,
      competitiveDetails,
      supportAreas,
      supportDetails,
    };
    onSave(data);
    if (onNext) onNext();
  };

  return (
    <div className="question-set" style={{ marginBottom: "30px" }}>
      {/* Business Drivers: How satisfied are you with your current efforts? */}
      <div className="question" style={{ marginTop: "20px", marginBottom: "20px" }}>
        <p>
          For each of the following areas, please indicate your level of satisfaction with your current performance.
        </p>
        {[
          { label: "Customer Relationships", state: customerSatisfaction, setter: setCustomerSatisfaction },
          { label: "Product/Service Quality", state: productSatisfaction, setter: setProductSatisfaction },
          { label: "Operational Efficiency", state: efficiencySatisfaction, setter: setEfficiencySatisfaction },
          { label: "Innovation", state: innovationSatisfaction, setter: setInnovationSatisfaction },
          { label: "Market Adaptability", state: marketAdaptabilitySatisfaction, setter: setMarketAdaptabilitySatisfaction },
        ].map((driver, idx) => (
          <div key={idx} className="sub-question" style={{ marginBottom: "15px" }}>
            <p>{driver.label} Satisfaction:</p>
            {renderRating(driver.label, driver.state, driver.setter)}
            {driver.state && parseInt(driver.state) <= 3 && (
              <div className="follow-up" style={{ marginTop: "10px" }}>
                <p>
                  What challenges or gaps do you perceive in your {driver.label}? (e.g., resource constraints, process issues)
                </p>
                <input
                  type="text"
                  placeholder={`Describe challenges in ${driver.label}`}
                  value={driversFollowUp[driver.label] || ""}
                  onChange={(e) =>
                    setDriversFollowUp((prev) => ({
                      ...prev,
                      [driver.label]: e.target.value,
                    }))
                  }
                  style={{ width: "80%", padding: "5px" }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* External Trends & Their Impact */}
      <div className="question" style={{ marginTop: "20px", marginBottom: "20px" }}>
        <p>
          How strongly do you feel that external trends (e.g., digital transformation, regulatory shifts, market disruptions)
          influence your strategy?
        </p>
        {renderRating("trendInfluence", trendInfluence, setTrendInfluence)}
        {trendInfluence && parseInt(trendInfluence) >= 4 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>
              Which trends or external factors have the most significant impact on your business? Please share any specific observations.
            </p>
            <input
              type="text"
              placeholder="Share details about external trends..."
              value={trendDetails}
              onChange={(e) => setTrendDetails(e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}
      </div>

      {/* Competitive Advantage Perception */}
      <div className="question" style={{ marginTop: "20px", marginBottom: "20px" }}>
        <p>
          How would you rate your organization’s ability to leverage its competitive advantages?
        </p>
        {renderRating("competitiveAdvantage", competitiveAdvantage, setCompetitiveAdvantage)}
        {competitiveAdvantage && parseInt(competitiveAdvantage) <= 3 && (
          <div className="follow-up" style={{ marginTop: "10px" }}>
            <p>
              What challenges do you face in building or sustaining a competitive edge? (e.g., market positioning, resource allocation)
            </p>
            <input
              type="text"
              placeholder="Describe areas for improvement..."
              value={competitiveDetails}
              onChange={(e) => setCompetitiveDetails(e.target.value)}
              style={{ width: "80%", padding: "5px" }}
            />
          </div>
        )}
      </div>

      {/* Areas for Additional Support */}
      <div className="question" style={{ marginTop: "20px", marginBottom: "20px" }}>
        <p>
          In which of the following areas do you feel that your organization might benefit from additional support or focus?
        </p>
        {["Processes", "Technology", "Talent/HR", "Customer Engagement"].map((area, idx) => (
          <div key={idx} className="sub-question" style={{ marginBottom: "15px" }}>
            <p>{area}:</p>
            {renderRating(area, supportAreas[area] || "", (value) =>
              setSupportAreas((prev) => ({ ...prev, [area]: value }))
            )}
            {supportAreas[area] && parseInt(supportAreas[area]) <= 3 && (
              <div className="follow-up" style={{ marginTop: "10px" }}>
                <p>
                  What specific challenges or constraints do you encounter in {area}? (Feel free to provide details.)
                </p>
                <input
                  type="text"
                  placeholder={`Describe challenges in ${area}`}
                  value={supportDetails[area] || ""}
                  onChange={(e) =>
                    setSupportDetails((prev) => ({ ...prev, [area]: e.target.value }))
                  }
                  style={{ width: "80%", padding: "5px" }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="navigation" style={{ marginTop: "20px" }}>
        <button onClick={onBack} className="wizard-button">
          Back
        </button>
        <button onClick={handleSave} className="wizard-button">
          Save & Next
        </button>
      </div>
    </div>
  );
};

StrategicBusinessDrivers.propTypes = {
  initialData: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  onNext: PropTypes.func,
  onBack: PropTypes.func,
};

export default StrategicBusinessDrivers;
